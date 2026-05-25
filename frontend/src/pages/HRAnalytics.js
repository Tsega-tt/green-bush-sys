import React, { useState, useEffect, useCallback } from 'react';
import { FiBarChart2, FiTrendingUp, FiUsers, FiClock, FiFileText, FiDownload } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../services/api';

const HRAnalytics = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState(null);
  const [productivity, setProductivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('monthly');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'dashboard') {
        console.log('Loading HR dashboard data with period:', period);
        const response = await api.hrAnalytics.getDashboardData({ period });
        console.log('HR dashboard response:', response);
        setDashboardData(response.data?.data || null);
      } else if (activeTab === 'productivity') {
        console.log('Loading productivity data with period:', period);
        const response = await api.hrAnalytics.getProductivity({ period });
        console.log('Productivity response:', response);
        setProductivity(response.data?.data || []);
      }
    } catch (error) {
      console.error('Error loading HR analytics data:', error);
      console.error('Full error details:', error.response || error);
      
      // Check if it's a database table missing error
      const errorMessage = error.response?.data?.message || error.message;
      if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
        toast.error('HR database tables not found. Please run: npm run add-hr-management');
      } else {
        toast.error(`Failed to load ${activeTab} analytics data: ${errorMessage}`);
      }
      
      // Set empty data to prevent UI errors
      if (activeTab === 'dashboard') setDashboardData(null);
      else if (activeTab === 'productivity') setProductivity([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const generateReport = async (reportType) => {
    try {
      switch (reportType) {
        case 'daily':
          await api.hrAnalytics.getDailyAttendanceReport();
          break;
        case 'weekly':
          await api.hrAnalytics.getWeeklyPerformanceReport();
          break;
        case 'monthly':
          await api.hrAnalytics.getMonthlyPayrollReport();
          break;
        case 'quarterly':
          await api.hrAnalytics.getQuarterlyReviewReport();
          break;
        case 'annual':
          await api.hrAnalytics.getAnnualAssessmentReport();
          break;
        default:
          throw new Error('Invalid report type');
      }
      toast.success(`${reportType} report generated successfully`);
      // Here you would typically download or display the report
    } catch (error) {
      toast.error(`Failed to generate ${reportType} report`);
    }
  };

  const DashboardTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">HR Dashboard</h3>
        <select 
          value={period} 
          onChange={(e) => setPeriod(e.target.value)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
        </select>
      </div>

      {dashboardData && dashboardData.summary ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Employees</p>
                  <p className="text-2xl font-bold text-blue-600">{dashboardData.summary.total_employees || 0}</p>
                </div>
                <FiUsers className="text-blue-500" size={24} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Avg Productivity</p>
                  <p className="text-2xl font-bold text-green-600">{dashboardData.summary.average_productivity || 0}</p>
                </div>
                <FiTrendingUp className="text-green-500" size={24} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Attendance Rate</p>
                  <p className="text-2xl font-bold text-purple-600">{dashboardData.summary.average_attendance_rate || 0}%</p>
                </div>
                <FiClock className="text-purple-500" size={24} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Satisfaction Rate</p>
                  <p className="text-2xl font-bold text-orange-600">{dashboardData.summary.average_satisfaction_rate || 0}%</p>
                </div>
                <FiBarChart2 className="text-orange-500" size={24} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow border">
              <h4 className="font-semibold mb-4">Top Performers</h4>
              <div className="space-y-3">
                {dashboardData.productivity && dashboardData.productivity.length > 0 ? 
                  dashboardData.productivity.slice(0, 5).map((emp, index) => (
                    <div key={emp.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </span>
                        <span>{emp.full_name}</span>
                      </div>
                      <span className="text-green-600 font-medium">{emp.total_orders || 0} orders</span>
                    </div>
                  )) : (
                    <p className="text-gray-500 text-center py-4">No performance data available</p>
                  )
                }
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <h4 className="font-semibold mb-4">Department Performance</h4>
              <div className="space-y-3">
                {dashboardData.productivity && dashboardData.productivity.length > 0 ? 
                  ['cafe_waiter', 'kitchen_staff', 'cashier', 'bakery_employee'].map((role) => {
                    const roleData = dashboardData.productivity.filter(emp => emp.role === role);
                    const avgOrders = roleData.reduce((sum, emp) => sum + (emp.total_orders || 0), 0) / roleData.length || 0;
                    return (
                      <div key={role} className="flex items-center justify-between">
                        <span className="capitalize">{role.replace('_', ' ')}</span>
                        <span className="text-blue-600 font-medium">{avgOrders.toFixed(1)} avg orders</span>
                      </div>
                    );
                  }) : (
                    <p className="text-gray-500 text-center py-4">No department data available</p>
                  )
                }
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <FiBarChart2 size={48} className="mx-auto mb-4 text-gray-300" />
          <p>No HR analytics data available yet.</p>
          <p className="text-sm">Data will appear here once employees start working and performance is tracked.</p>
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm max-w-md mx-auto">
            <p><strong>Note:</strong> If you're seeing errors, make sure to run the HR setup command:</p>
            <code className="bg-blue-100 px-2 py-1 rounded mt-2 inline-block">npm run add-hr-management</code>
          </div>
        </div>
      )}
    </div>
  );

  const ProductivityTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Employee Productivity</h3>
        <select 
          value={period} 
          onChange={(e) => setPeriod(e.target.value)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orders</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sales</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completion Rate</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {productivity.length > 0 ? productivity.map((emp) => (
              <tr key={emp.id}>
                <td className="px-6 py-4 whitespace-nowrap">{emp.full_name}</td>
                <td className="px-6 py-4 whitespace-nowrap capitalize">{emp.role?.replace('_', ' ')}</td>
                <td className="px-6 py-4 whitespace-nowrap">{emp.total_orders || 0}</td>
                <td className="px-6 py-4 whitespace-nowrap">${parseFloat(emp.total_sales || 0).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    emp.completion_rate >= 90 ? 'bg-green-100 text-green-800' :
                    emp.completion_rate >= 75 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {emp.completion_rate || 0}%
                  </span>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                  <FiTrendingUp size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>No productivity data available.</p>
                  <p className="text-sm">Employee productivity will appear here once orders are processed.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const ReportsTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Generate Reports</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { type: 'daily', title: 'Daily Attendance', desc: 'Daily attendance report for all employees' },
          { type: 'weekly', title: 'Weekly Performance', desc: 'Weekly performance summary by employee' },
          { type: 'monthly', title: 'Monthly Payroll', desc: 'Monthly payroll records and summaries' },
          { type: 'quarterly', title: 'Quarterly Review', desc: 'Quarterly performance reviews and goals' },
          { type: 'annual', title: 'Annual Assessment', desc: 'Annual employee assessment report' }
        ].map((report) => (
          <div key={report.type} className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="font-medium">{report.title}</h4>
                <p className="text-sm text-gray-600 mt-1">{report.desc}</p>
              </div>
              <FiFileText className="text-blue-500" />
            </div>
            
            <button 
              onClick={() => generateReport(report.type)}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700"
            >
              <FiDownload size={16} />
              Generate
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">HR Analytics</h1>
        <p className="text-gray-600">Analyze staff performance, attendance, and generate reports</p>
      </div>

      <div className="mb-6">
        <nav className="flex space-x-8">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: FiBarChart2 },
            { id: 'productivity', label: 'Productivity', icon: FiTrendingUp },
            { id: 'reports', label: 'Reports', icon: FiFileText }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon size={20} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'productivity' && <ProductivityTab />}
          {activeTab === 'reports' && <ReportsTab />}
        </>
      )}
    </div>
  );
};

export default HRAnalytics;
