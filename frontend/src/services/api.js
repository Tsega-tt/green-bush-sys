import axios from 'axios';
import toast from 'react-hot-toast';

const normalizeBaseUrl = (url) => {
  const s = String(url || '').trim();
  if (!s) return '/api';
  return s.replace(/\/+$/, '');
};

export const API_BASE_URL = normalizeBaseUrl(process.env.REACT_APP_API_BASE_URL || '/api');
const NETWORK_LOGOUT_FLAG_KEY = 'network_logout_in_progress_v1';
const NETWORK_LOGOUT_COOLDOWN_MS = 30000;

const handleNetworkLogout = () => {
  try {
    const prev = parseInt(sessionStorage.getItem(NETWORK_LOGOUT_FLAG_KEY) || '0', 10);
    if (Number.isFinite(prev) && prev > 0 && Date.now() - prev < NETWORK_LOGOUT_COOLDOWN_MS) return;
    sessionStorage.setItem(NETWORK_LOGOUT_FLAG_KEY, String(Date.now()));
  } catch {
    // ignore
  }

  try {
    toast.error('Network error. Please check your connection and try again.');
  } catch {
    // ignore
  }
};

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth headers and user ID
api.interceptors.request.use(
  (config) => {
    // Get user data from localStorage
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        
        // Add user_id to requests that need authentication
        // Skip auth routes and health check
        const skipAuthRoutes = ['/auth/', '/health'];
        const needsAuth = !skipAuthRoutes.some(route => config.url.includes(route));
        
        if (needsAuth) {
          const rawId = userData?.id ?? userData?.user_id ?? null;
          const userId = rawId != null ? parseInt(rawId, 10) : null;
          if (!Number.isFinite(userId)) return config;

          // Always expose the user id via header so GET endpoints (e.g. the
          // inventory module's resolveUser) authenticate without a body.
          config.headers = config.headers || {};
          config.headers['x-user-id'] = userId;

          // Add user_id to request body for POST/PUT/PATCH requests (only if not already present)
          if (config.method !== 'get') {
            if (config.data && typeof config.data === 'object') {
              if (!config.data.user_id) {
                config.data.user_id = userId;
              }
            } else if (!config.data) {
              config.data = { user_id: userId };
            }
          }
        }
      }
    } catch (error) {
      console.error('Error adding user ID to request:', error);
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors globally
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle common errors
    if (error.response) {
      const { status, data, config } = error.response;
      
      // Don't show toast errors for auth endpoints (login/register) at all
      // Let the AuthContext handle auth-related error messages
      const isAuthEndpoint = config?.url?.includes('/auth/');
      
      if (!isAuthEndpoint) {
        switch (status) {
          case 401:
            toast.error('Unauthorized access. Please login again.');
            break;
          case 403:
            toast.error('Access forbidden. Insufficient permissions.');
            break;
          case 404:
            console.warn('Resource not found:', config?.url);
            break;
          case 409:
            toast.error(data.message || 'Conflict error occurred.');
            break;
          case 500:
            toast.error('Server error. Please try again later.');
            break;
          default:
            toast.error(data.message || 'An error occurred.');
        }
      }
    } else if (error.request) {
      handleNetworkLogout();
    } else {
      toast.error('An unexpected error occurred.');
    }
    
    return Promise.reject(error);
  }
);

// API service methods
const apiService = {
  // Authentication
  auth: {
    login: (credentials) => api.post('/auth/login', credentials),
    pinLogin: (credentials) => api.post('/auth/pin-login', credentials),
    staffLogin: (credentials) => api.post('/auth/staff-login', credentials),
    register: (userData) => api.post('/auth/register', userData),
    logout: () => api.post('/auth/logout'),
    getProfile: (userId) => api.get(`/auth/profile/${userId}`),
    updateProfile: (userId, data) => api.put(`/auth/profile/${userId}`, data),
    changePassword: (userId, data) => api.post(`/users/${userId}/change-password`, data),
  },

  // Users
  users: {
    getAll: (params) => api.get('/users', { params }),
    getById: (id) => api.get(`/users/${id}`),
    create: (userData) => api.post('/users', userData),
    update: (id, userData) => api.put(`/users/${id}`, userData),
    delete: (id) => api.delete(`/users/${id}`),
    toggleStatus: (id) => api.patch(`/users/${id}/toggle-status`),
    getByRole: (role) => api.get(`/users/role/${role}`),
    getEmployees: () => api.get('/users/employees'),
    getWaiters: () => api.get('/users/waiters'),
    getKitchenStaff: () => api.get('/users/kitchen-staff'),
    getCashiers: () => api.get('/users/cashiers'),
  },

  // Menu
  menu: {
    getAll: (params) => api.get('/menu', { params }),
    getById: (id) => api.get(`/menu/${id}`),
    getBakeryMenu: () => api.get('/menu/bakery'),
    getCafeMenu: () => api.get('/menu/cafe'),
    create: (menuData) => api.post('/menu', menuData),
    update: (id, menuData) => api.put(`/menu/${id}`, menuData),
    delete: (id) => api.delete(`/menu/${id}`),
    toggleAvailability: (id) => api.patch(`/menu/${id}/toggle-availability`),
  },

  // Inventory
  inventory: {
    getAll: (params) => api.get('/inventory', { params }),
    create: (data) => api.post('/inventory', data),
    update: (id, data) => api.put(`/inventory/${id}`, data),
    delete: (id) => api.delete(`/inventory/${id}`),
    updateQuantity: (id, data) => api.patch(`/inventory/${id}/quantity`, data),
  },

  // Orders
  orders: {
    getAll: (params) => api.get('/orders', { params }),
    getById: (id) => api.get(`/orders/${id}`),
    create: (orderData) => api.post('/orders', orderData),
    createBakery: (orderData) => api.post('/orders/bakery', orderData),
    createCafe: (orderData) => api.post('/orders/cafe', orderData),
    updateStatus: (id, statusData) => api.put(`/orders/${id}/status`, statusData),
    updateItems: (id, itemsData) => api.put(`/orders/${id}/items`, itemsData),
    addItems: (id, itemsData) => api.post(`/orders/${id}/add-items`, itemsData),
    markReady: (id, data) => api.patch(`/orders/${id}/ready`, data),
    complete: (id, data) => api.patch(`/orders/${id}/complete`, data),
    getPending: (params) => api.get('/orders/pending', { params }),
    getReady: (params) => api.get('/orders/ready', { params }),
    getKitchenOrders: () => api.get('/orders/kitchen/orders'),
    getStatusHistory: (id) => api.get(`/orders/${id}/status-history`),
    getOrdersForPayment: (params) => api.get('/orders/payment/pending', { params }),
    getOccupiedTables: () => api.get('/orders/tables/occupied'),
    getUnprinted: (config) => api.get('/orders/unprinted', config),
    printOrder: (id) => api.post(`/orders/${id}/print`),
    getReceiptImages: (id) => api.get(`/orders/${id}/receipt-images`),
    getTicketPayload: (id) => api.get(`/orders/${id}/ticket-payload`),
    markPrinted: (id) => api.post(`/orders/${id}/mark-printed`),
  },

  // Payments
  payments: {
    getAll: (params) => api.get('/payments/history', { params }),
    getById: (id) => api.get(`/payments/${id}`),
    getByOrder: (orderId) => api.get(`/payments/order/${orderId}`),
    create: (paymentData) => api.post('/payments', paymentData),
    createWithQR: (paymentData) => api.post('/payments/with-qr', paymentData),
    updateStatus: (id, statusData) => api.put(`/payments/${id}/status`, statusData),
    generateQR: (id) => api.post(`/payments/${id}/generate-qr`),
    confirm: (id, data) => api.post(`/payments/${id}/confirm`, data),
    getPending: (params) => api.get('/payments/pending', { params }),
    verifyQR: (qrData) => api.post('/payments/qr/verify', qrData),
  },

  // Tables
  tables: {
    getAll: () => api.get('/tables'),
    getStatus: () => api.get('/tables/status'),
    create: (tableData) => api.post('/tables', tableData),
    delete: (id) => api.delete(`/tables/${id}`),
    releaseAll: () => api.post('/tables/release-all'),
  },

  // Employees
  employees: {
    getLedger: (params) => api.get('/employees/ledger', { params }),
  },

  // Attendance
  attendance: {
    getAll: (params) => api.get('/attendance', { params }),
    getUserAttendance: (userId, params) => api.get(`/attendance/user/${userId}`, { params }),
    getCurrentStatus: (userId) => api.get(`/attendance/user/${userId}/status`),
    getTodayAttendance: () => api.get('/attendance/today'),
    getWeeklyReport: (params) => api.get('/attendance/weekly-report', { params }),
    getSummary: (params) => api.get('/attendance/summary', { params }),
    clockIn: (userData) => api.post('/attendance/clock-in', userData),
    clockOut: (userData) => api.post('/attendance/clock-out', userData),
  },

  expenses: {
    getAll: (params) => api.get('/expenses', { params }),
    getMeta: () => api.get('/expenses/meta'),
    getDashboard: (params) => api.get('/expenses/dashboard', { params }),
    getReports: (params) => api.get('/expenses/reports', { params }),
    create: (data) => api.post('/expenses', data),
    update: (id, data) => api.put(`/expenses/${id}`, data),
    delete: (id) => api.delete(`/expenses/${id}`),
  },

  // Performance Management
  performance: {
    // Metrics
    createMetric: (metricData) => api.post('/performance/metrics', metricData),
    getMetricsByUser: (userId, params) => api.get(`/performance/metrics/user/${userId}`, { params }),
    getMetricsByType: (metricType, params) => api.get(`/performance/metrics/type/${metricType}`, { params }),
    updateMetric: (metricId, updateData) => api.put(`/performance/metrics/${metricId}`, updateData),
    
    // Reviews
    createReview: (reviewData) => api.post('/performance/reviews', reviewData),
    getReviewsByUser: (userId) => api.get(`/performance/reviews/user/${userId}`),
    getReviewById: (reviewId) => api.get(`/performance/reviews/${reviewId}`),
    updateReview: (reviewId, updateData) => api.put(`/performance/reviews/${reviewId}`, updateData),
    getUpcomingReviews: () => api.get('/performance/reviews/upcoming/all'),
    
    // Goals
    createGoal: (goalData) => api.post('/performance/goals', goalData),
    getGoalsByUser: (userId) => api.get(`/performance/goals/user/${userId}`),
    updateGoal: (goalId, updateData) => api.put(`/performance/goals/${goalId}`, updateData),
    deleteGoal: (goalId) => api.delete(`/performance/goals/${goalId}`),
    
    // Analytics
    getOverview: (params) => api.get('/performance/analytics/overview', { params }),
    getTopPerformers: (params) => api.get('/performance/analytics/top-performers', { params }),
  },

  // Payroll System
  payroll: {
    // Salaries
    createSalary: (salaryData) => api.post('/payroll/salaries', salaryData),
    getSalaryByUser: (userId) => api.get(`/payroll/salaries/user/${userId}`),
    getAllSalaries: () => api.get('/payroll/salaries'),
    updateSalary: (salaryId, updateData) => api.put(`/payroll/salaries/${salaryId}`, updateData),
    
    // Payroll Records
    createPayrollRecord: (payrollData) => api.post('/payroll/records', payrollData),
    getPayrollRecordsByUser: (userId, params) => api.get(`/payroll/records/user/${userId}`, { params }),
    getAllPayrollRecords: (params) => api.get('/payroll/records', { params }),
    updatePayrollRecord: (recordId, updateData) => api.put(`/payroll/records/${recordId}`, updateData),
    calculatePayroll: (calculationData) => api.post('/payroll/calculate', calculationData),
    
    // Benefits
    createBenefit: (benefitData) => api.post('/payroll/benefits', benefitData),
    getBenefitsByUser: (userId) => api.get(`/payroll/benefits/user/${userId}`),
    getAllBenefits: () => api.get('/payroll/benefits'),
    updateBenefit: (benefitId, updateData) => api.put(`/payroll/benefits/${benefitId}`, updateData),
    deleteBenefit: (benefitId) => api.delete(`/payroll/benefits/${benefitId}`),
    
    // Analytics
    getSummary: (params) => api.get('/payroll/analytics/summary', { params }),
    getByDepartment: (params) => api.get('/payroll/analytics/department', { params }),
  },

  // HR Analytics
  hrAnalytics: {
    // Staff Analytics
    getProductivity: (params) => api.get('/hr-analytics/productivity', { params }),
    getAttendancePatterns: (params) => api.get('/hr-analytics/attendance-patterns', { params }),
    getTurnoverRates: (params) => api.get('/hr-analytics/turnover-rates', { params }),
    getTrainingEffectiveness: () => api.get('/hr-analytics/training-effectiveness'),
    getCustomerSatisfaction: (params) => api.get('/hr-analytics/customer-satisfaction', { params }),
    
    // Reports
    getDailyAttendanceReport: (params) => api.get('/hr-analytics/reports/daily-attendance', { params }),
    getWeeklyPerformanceReport: (params) => api.get('/hr-analytics/reports/weekly-performance', { params }),
    getMonthlyPayrollReport: (params) => api.get('/hr-analytics/reports/monthly-payroll', { params }),
    getQuarterlyReviewReport: (params) => api.get('/hr-analytics/reports/quarterly-review', { params }),
    getAnnualAssessmentReport: (params) => api.get('/hr-analytics/reports/annual-assessment', { params }),
    
    // Dashboard
    getDashboardData: (params) => api.get('/hr-analytics/dashboard', { params }),
    
    // Cache
    cacheAnalytics: (cacheData) => api.post('/hr-analytics/cache', cacheData),
    getCachedAnalytics: (params) => api.get('/hr-analytics/cache', { params }),
  },

  // Store Inventory (5 stores)
  stores: {
    getAll:          ()                    => api.get('/stores'),
    getItems:        (storeId)             => api.get(`/stores/${storeId}/items`),
    createItem:      (storeId, data)       => api.post(`/stores/${storeId}/items`, data),
    updateItem:      (storeId, id, data)   => api.put(`/stores/${storeId}/items/${id}`, data),
    adjustQuantity:  (storeId, id, data)   => api.patch(`/stores/${storeId}/items/${id}/quantity`, data),
    deleteItem:      (storeId, id)         => api.delete(`/stores/${storeId}/items/${id}`),
  },

  // Purchase Requisitions
  purchaseRequisitions: {
    getAll:         (params) => api.get('/purchase-requisitions', { params }),
    getZones:       ()       => api.get('/purchase-requisitions/zones'),
    getSummary:     ()       => api.get('/purchase-requisitions/summary'),
    create:         (data)   => api.post('/purchase-requisitions', data),
    approve:        (id, data) => api.patch(`/purchase-requisitions/${id}/approve`, data),
    adjustApprove:  (id, data) => api.patch(`/purchase-requisitions/${id}/adjust-approve`, data),
    reject:         (id, data) => api.patch(`/purchase-requisitions/${id}/reject`, data),
  },

  // Item Requests & Workflow
  itemRequests: {
    getAll:         (params)  => api.get('/item-requests', { params }),
    getById:        (id)      => api.get(`/item-requests/${id}`),
    create:         (data)    => api.post('/item-requests', data),
    storeApprove:   (id, data) => api.patch(`/item-requests/${id}/store-approve`, data),
    fnbApprove:     (id, data) => api.patch(`/item-requests/${id}/fnb-approve`, data),
    reject:         (id, data) => api.patch(`/item-requests/${id}/reject`, data),
  },

  // Health check
  health: () => api.get('/health'),
};

// Raw axios instance (carries the x-user-id / user_id request interceptors).
// The inventory module talks to /api/inv/* directly through this.
export { api };

export default apiService;
