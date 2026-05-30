import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoadingSpinner from './components/common/LoadingSpinner';
import ErrorBoundary from './components/common/ErrorBoundary';

// Import pages
import LoginPage from './pages/LoginPage';
import DashboardLayout from './components/layout/DashboardLayout';

// Import role-specific dashboards
import AdminDashboard from './pages/dashboards/AdminDashboard';
import BakeryEmployeeDashboard from './pages/dashboards/BakeryEmployeeDashboard';
import CashierDashboard from './pages/dashboards/CashierDashboard';
import KitchenStaffDashboard from './pages/dashboards/KitchenStaffDashboard';

// Import waiter-specific components
import CafeWaiterDashboard from './pages/dashboards/CafeWaiterDashboard';
import CreateOrder from './pages/waiter/CreateOrder';
import OrderHistory from './pages/waiter/OrderHistory';

// Import bakery-specific components
import CreateBakeryOrder from './pages/bakery/CreateBakeryOrder';
import BakeryOrderHistory from './pages/bakery/BakeryOrderHistory';

// Import feature pages
import MenuManagement from './pages/MenuManagement';
import OrderManagement from './pages/OrderManagement';
import UserManagement from './pages/UserManagement';
import AttendanceManagement from './pages/AttendanceManagement';
import PaymentManagement from './pages/PaymentManagement';
import PaymentsItems from './pages/PaymentsItems';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import PerformanceManagement from './pages/PerformanceManagement';
import PayrollManagement from './pages/PayrollManagement';
import HRAnalytics from './pages/HRAnalytics';
import InventoryManagement from './pages/InventoryManagement';
import TableManagement from './pages/TableManagement';
import EmployeeManagement from './pages/EmployeeManagement';
import CashierEmployees from './pages/cashier/CashierEmployees';
import BeuDelivery from './pages/cashier/BeuDelivery';
import ExpenseManagement from './pages/ExpenseManagement';
import StoreInventory from './pages/StoreInventory';
import ItemRequests from './pages/ItemRequests';
import StoreAdminDashboard from './pages/dashboards/StoreAdminDashboard';
import FnbManagerDashboard from './pages/dashboards/FnbManagerDashboard';
import HRAdminDashboard from './pages/dashboards/HRAdminDashboard';
import OwnerDashboard from './pages/dashboards/OwnerDashboard';
import PurchaseRequisition from './pages/PurchaseRequisition';

// PostgreSQL inventory module (Phases 0-7)
import InventoryDashboard from './pages/inventory/InventoryDashboard';
import InventoryTransfers from './pages/inventory/Transfers';
import InventoryApprovals from './pages/inventory/Approvals';
import PurchasingDashboard from './pages/inventory/PurchasingDashboard';
import PurchaseRequests from './pages/inventory/PurchaseRequests';
import PurchaseOrders from './pages/inventory/PurchaseOrders';
import GoodsReceipts from './pages/inventory/GoodsReceipts';
import Suppliers from './pages/inventory/Suppliers';
import Stores from './pages/inventory/Stores';
import ItemsMaster from './pages/inventory/ItemsMaster';
import RecipeBuilder from './pages/inventory/RecipeBuilder';
import CafeMenuManagement from './pages/cafe/MenuManagement';
import ItemAcceptance from './pages/inventory/ItemAcceptance';
import Waste from './pages/inventory/Waste';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    // Redirect to appropriate home page based on user role
    const getHomePath = () => {
      if (user?.role === 'cafe_waiter') return "/waiter/create-order";
      if (user?.role === 'bakery_employee') return "/bakery/create-order";
      if (user?.role === 'store_manager') return "/dashboard/inventory-pg";
      if (user?.role === 'purchaser') return "/dashboard/inventory-pg/purchase-requests";
      return "/dashboard";
    };
    return <Navigate to={getHomePath()} replace />;
  }

  return children;
};

// Waiter Router Component
const WaiterRouter = () => {
  return (
    <Routes>
      {/* Default route shows waiter dashboard */}
      <Route index element={<CafeWaiterDashboard />} />
      <Route path="dashboard" element={<CafeWaiterDashboard />} />
      <Route path="create-order" element={<CreateOrder />} />
      <Route path="order-history" element={<OrderHistory />} />
      <Route path="profile" element={<Profile />} />
      {/* Fallback route */}
      <Route path="*" element={<Navigate to="/waiter" replace />} />
    </Routes>
  );
};

// Bakery Router Component
const BakeryRouter = () => {
  return (
    <Routes>
      {/* Default route shows create bakery order page */}
      <Route index element={<CreateBakeryOrder />} />
      <Route path="create-order" element={<CreateBakeryOrder />} />
      <Route path="order-history" element={<BakeryOrderHistory />} />
      <Route path="dashboard" element={<BakeryEmployeeDashboard />} />
      <Route path="profile" element={<Profile />} />
      {/* Fallback route */}
      <Route path="*" element={<Navigate to="/bakery/create-order" replace />} />
    </Routes>
  );
};

// Dashboard Router Component for non-waiter, non-bakery roles
const DashboardRouter = () => {
  const { user } = useAuth();
  const location = useLocation();

  const getDashboardComponent = () => {
    switch (user?.role) {
      case 'admin':
        return <AdminDashboard />;
      case 'cashier':
        return <CashierDashboard />;
      case 'kitchen_staff':
        return <KitchenStaffDashboard />;
      case 'hr_admin':
        return <HRAdminDashboard />;
      case 'store_admin':
        return <StoreAdminDashboard />;
      case 'store_manager':
        return <InventoryDashboard />;
      case 'purchaser':
        return <PurchasingDashboard />;
      case 'fnb_manager':
        return <FnbManagerDashboard />;
      case 'owner':
        return <OwnerDashboard />;
      case 'item_request':
        return <ItemRequests />;
      default:
        return <div className="p-6 text-center">Invalid user role</div>;
    }
  };

  return (
    <DashboardLayout>
      <ErrorBoundary routeKey={location.pathname}>
      <Routes>
        {/* Dashboard Home */}
        <Route index element={getDashboardComponent()} />
        
        {/* Profile (accessible to all authenticated users) */}
        <Route path="profile" element={<Profile />} />
        
        {/* Orders (accessible to relevant roles) */}
        <Route 
          path="orders" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'bakery_employee', 'cafe_waiter', 'kitchen_staff']}>
              <OrderManagement />
            </ProtectedRoute>
          } 
        />
        
        {/* Admin-only routes */}
        <Route 
          path="users" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'hr_admin']}>
              <UserManagement />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="employees" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'hr_admin']}>
              <EmployeeManagement />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="menu" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'cafe_waiter', 'bakery_employee', 'kitchen_staff']}>
              <MenuManagement />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="inventory" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <InventoryManagement />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="reports" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Reports />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="expenses" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ExpenseManagement />
            </ProtectedRoute>
          }
        />
        <Route 
          path="store-inventory" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'store_admin', 'fnb_manager']}>
              <StoreInventory />
            </ProtectedRoute>
          }
        />
        <Route 
          path="item-requests" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'store_admin', 'fnb_manager', 'item_request']}>
              <ItemRequests />
            </ProtectedRoute>
          }
        />
        <Route 
          path="purchase-requisitions"
          element={
            <ProtectedRoute allowedRoles={['admin', 'fnb_manager', 'owner']}>
              <PurchaseRequisition />
            </ProtectedRoute>
          }
        />
        {/* PostgreSQL inventory module (Phases 0-7) — mounted under inventory-pg
            to coexist with the legacy /dashboard/inventory page. */}
        <Route
          path="inventory-pg"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner', 'fnb_manager', 'store_admin', 'store_manager', 'purchaser']}>
              <InventoryDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/transfers"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner', 'store_admin', 'store_manager']}>
              <InventoryTransfers />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/approvals"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner', 'fnb_manager']}>
              <InventoryApprovals />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/purchasing"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner', 'store_admin', 'store_manager']}>
              <PurchasingDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/purchase-requests"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner', 'fnb_manager', 'store_manager', 'purchaser']}>
              <PurchaseRequests />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/purchase-orders"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner']}>
              <PurchaseOrders />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/goods-receipts"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner', 'store_manager']}>
              <GoodsReceipts />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/suppliers"
          element={
            <ProtectedRoute allowedRoles={['admin', 'purchaser']}>
              <Suppliers />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/stores"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Stores />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/items"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner']}>
              <ItemsMaster />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/recipes"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner']}>
              <RecipeBuilder />
            </ProtectedRoute>
          }
        />
        <Route
          path="cafe/menu"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner']}>
              <CafeMenuManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/acceptance"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner', 'fnb_manager', 'purchaser', 'store_admin', 'store_manager']}>
              <ItemAcceptance />
            </ProtectedRoute>
          }
        />
        <Route
          path="inventory-pg/waste"
          element={
            <ProtectedRoute allowedRoles={['admin', 'owner', 'store_manager']}>
              <Waste />
            </ProtectedRoute>
          }
        />
        <Route
          path="attendance"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AttendanceManagement />
            </ProtectedRoute>
          }
        />
        <Route 
          path="tables" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <TableManagement />
            </ProtectedRoute>
          } 
        />
        {/* Payments (accessible to cashiers and admin) */}
        <Route 
          path="payments" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'cashier']}>
              <PaymentManagement />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="payments-items" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'cashier']}>
              <PaymentsItems />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="cashier/employees" 
          element={
            <ProtectedRoute allowedRoles={['cashier']}>
              <CashierEmployees />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="beu-delivery" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'cashier']}>
              <BeuDelivery />
            </ProtectedRoute>
          } 
        />
        
        {/* HR Management (admin only) */}
        <Route 
          path="performance" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <PerformanceManagement />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="payroll" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <PayrollManagement />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="hr-analytics" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <HRAnalytics />
            </ProtectedRoute>
          } 
        />
        
        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </ErrorBoundary>
    </DashboardLayout>
  );
};

// Main App Component
const AppContent = () => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  // Determine redirect path based on user role
  const getRedirectPath = () => {
    if (!isAuthenticated) return "/login";
    switch (user?.role) {
      case 'cafe_waiter':
        return "/waiter/create-order";
      case 'bakery_employee':
        return "/bakery/create-order";
      // Inventory-focused roles land directly on the surface they work in.
      case 'store_manager':
        return "/dashboard/inventory-pg";
      case 'purchaser':
        return "/dashboard/inventory-pg/purchase-requests";
      default:
        return "/dashboard";
    }
  };

  return (
    <Routes>
      {/* Public routes */}
      <Route 
        path="/login" 
        element={
          isAuthenticated ? <Navigate to={getRedirectPath()} replace /> : <LoginPage />
        } 
      />
      
      {/* Waiter-specific routes */}
      <Route 
        path="/waiter/*" 
        element={
          <ProtectedRoute allowedRoles={['cafe_waiter']}>
            <WaiterRouter />
          </ProtectedRoute>
        } 
      />
      
      {/* Bakery-specific routes */}
      <Route 
        path="/bakery/*" 
        element={
          <ProtectedRoute allowedRoles={['bakery_employee']}>
            <BakeryRouter />
          </ProtectedRoute>
        } 
      />
      
      {/* Protected dashboard routes for non-waiter, non-bakery roles */}
      <Route 
        path="/dashboard/*" 
        element={
          <ProtectedRoute allowedRoles={['admin', 'cashier', 'kitchen_staff', 'hr_admin', 'store_admin', 'store_manager', 'purchaser', 'fnb_manager', 'owner', 'item_request', 'cafe_waiter', 'bakery_employee']}>
            <DashboardRouter />
          </ProtectedRoute>
        } 
      />
      
      {/* Root redirect */}
      <Route 
        path="/" 
        element={
          <Navigate to={getRedirectPath()} replace />
        } 
      />
      
      {/* Catch all route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// Main App with Providers
function App() {
  return (
    <AuthProvider>
      <div className="App">
        <AppContent />
      </div>
    </AuthProvider>
  );
}

export default App;
