import React, { useState, useEffect, useCallback } from 'react';
import { FiUser, FiTrendingUp, FiTarget, FiStar, FiPlus, FiEdit, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../services/api';

const PerformanceManagement = () => {
  const [activeTab, setActiveTab] = useState('metrics');
  const [employees, setEmployees] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [showAddMetricModal, setShowAddMetricModal] = useState(false);
  const [metricForm, setMetricForm] = useState({
    user_id: '',
    metric_type: 'punctuality',
    score: '5',
    period_start: '',
    period_end: '',
    notes: ''
  });

  const loadEmployees = useCallback(async () => {
    try {
      const response = await api.users.getAll();
      const users = response?.data?.data?.users || response?.data?.users || response?.data?.data || [];
      const arr = Array.isArray(users) ? users : [];
      setEmployees(arr.filter(user => user.role !== 'admin'));
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  }, []);

  const openAddMetricModal = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const isoDate = `${yyyy}-${mm}-${dd}`;

    setMetricForm({
      user_id: '',
      metric_type: 'punctuality',
      score: '5',
      period_start: isoDate,
      period_end: isoDate,
      notes: ''
    });
    setShowAddMetricModal(true);
  };

  const submitMetric = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        user_id: parseInt(metricForm.user_id, 10),
        metric_type: metricForm.metric_type,
        score: parseFloat(metricForm.score),
        period_start: metricForm.period_start,
        period_end: metricForm.period_end,
        notes: metricForm.notes
      };

      if (!payload.user_id || Number.isNaN(payload.user_id)) {
        toast.error('Please select an employee');
        return;
      }
      if (Number.isNaN(payload.score)) {
        toast.error('Please enter a valid score');
        return;
      }

      await api.performance.createMetric(payload);
      toast.success('Metric added successfully');
      setShowAddMetricModal(false);
      await loadData();
    } catch (error) {
      console.error('Error creating metric:', error);
      const message = error?.response?.data?.message || error?.message || 'Failed to add metric';
      toast.error(message);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'metrics') {
        console.log('Loading performance metrics...');
        const response = await api.performance.getOverview();
        console.log('Performance metrics response:', response);
        setMetrics(response.data?.data || []);
      } else if (activeTab === 'reviews') {
        console.log('Loading performance reviews...');
        const response = await api.performance.getUpcomingReviews();
        console.log('Performance reviews response:', response);
        setReviews(response.data?.data || []);
      } else if (activeTab === 'goals') {
        if (selectedEmployee) {
          console.log('Loading goals for employee:', selectedEmployee);
          const response = await api.performance.getGoalsByUser(selectedEmployee);
          console.log('Goals response:', response);
          setGoals(response.data?.data || []);
        } else {
          setGoals([]);
        }
      }
    } catch (error) {
      console.error('Error loading performance data:', error);
      console.error('Full error details:', error.response || error);

      // Check if it's a database table missing error
      const errorMessage = error.response?.data?.message || error.message;
      if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
        toast.error('HR database tables not found. Please run: npm run add-hr-management');
      } else {
        toast.error(`Failed to load ${activeTab} data: ${errorMessage}`);
      }

      // Set empty arrays to prevent UI errors
      if (activeTab === 'metrics') setMetrics([]);
      else if (activeTab === 'reviews') setReviews([]);
      else if (activeTab === 'goals') setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedEmployee]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MetricsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Performance Metrics</h3>
        <button
          onClick={openAddMetricModal}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <FiPlus size={16} />
          Add Metric
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.length > 0 ? metrics.map((metric, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium capitalize">{metric.metric_type?.replace('_', ' ')}</h4>
              <FiStar className="text-yellow-500" />
            </div>
            <div className="text-2xl font-bold text-blue-600 mb-2">
              {parseFloat(metric.average_score || 0).toFixed(1)}/5.0
            </div>
            <div className="text-sm text-gray-600">
              {metric.total_records || 0} records
            </div>
          </div>
        )) : (
          <div className="col-span-full text-center py-12 text-gray-500">
            <FiStar size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No performance metrics available yet.</p>
            <p className="text-sm">Add some performance data to see metrics here.</p>
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
              <p><strong>Note:</strong> If you're seeing errors, make sure to run the HR setup command:</p>
              <code className="bg-blue-100 px-2 py-1 rounded mt-2 inline-block">npm run add-hr-management</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const ReviewsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Performance Reviews</h3>
        <button className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <FiPlus size={16} />
          Schedule Review
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Review Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reviews.length > 0 ? reviews.map((review) => (
              <tr key={review.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <FiUser className="mr-2" />
                    {review.full_name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap capitalize">
                  {review.review_type_due?.replace('_', ' ')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-red-600">
                  Overdue
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button className="text-blue-600 hover:text-blue-800">
                    <FiEdit size={16} />
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                  <FiStar size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>No upcoming reviews found.</p>
                  <p className="text-sm">Schedule some performance reviews to see them here.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const GoalsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Employee Goals</h3>
        <div className="flex gap-4">
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="border rounded-lg px-3 py-2"
          >
            <option value="">Select Employee</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.full_name}</option>
            ))}
          </select>
          <button className="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <FiPlus size={16} />
            Add Goal
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goals.length > 0 ? goals.map((goal) => (
          <div key={goal.id} className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="font-medium">{goal.title}</h4>
                <p className="text-sm text-gray-600 mt-1">{goal.description}</p>
              </div>
              <div className="flex gap-2">
                <button className="text-blue-600 hover:text-blue-800">
                  <FiEdit size={16} />
                </button>
                <button className="text-red-600 hover:text-red-800">
                  <FiTrash2 size={16} />
                </button>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Progress</span>
                <span>{goal.progress || 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full"
                  style={{ width: `${goal.progress || 0}%` }}
                ></div>
              </div>
            </div>

            <div className="flex justify-between text-sm text-gray-600">
              <span>Status: <span className={`capitalize ${goal.status === 'active' ? 'text-green-600' : 'text-gray-600'}`}>{goal.status}</span></span>
              <span>Due: {goal.target_date ? new Date(goal.target_date).toLocaleDateString() : 'No due date'}</span>
            </div>
          </div>
        )) : (
          <div className="col-span-full text-center py-12 text-gray-500">
            <FiTarget size={48} className="mx-auto mb-4 text-gray-300" />
            <p>{selectedEmployee ? 'No goals found for this employee.' : 'Select an employee to view their goals.'}</p>
            <p className="text-sm">Set some goals to track employee development.</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Performance Management</h1>
        <p className="text-gray-600">Track employee performance, reviews, and goals</p>
      </div>

      <div className="mb-6">
        <nav className="flex space-x-8">
          {[
            { id: 'metrics', label: 'Metrics', icon: FiTrendingUp },
            { id: 'reviews', label: 'Reviews', icon: FiStar },
            { id: 'goals', label: 'Goals', icon: FiTarget }
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
          {activeTab === 'metrics' && <MetricsTab />}
          {activeTab === 'reviews' && <ReviewsTab />}
          {activeTab === 'goals' && <GoalsTab />}
        </>
      )}

      {showAddMetricModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Metric</h3>
              <button
                onClick={() => setShowAddMetricModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>

            <form onSubmit={submitMetric} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <select
                  value={metricForm.user_id}
                  onChange={(e) => setMetricForm(prev => ({ ...prev, user_id: e.target.value }))}
                  className="input-field"
                  required
                >
                  <option value="">Select Employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Metric Type</label>
                <select
                  value={metricForm.metric_type}
                  onChange={(e) => setMetricForm(prev => ({ ...prev, metric_type: e.target.value }))}
                  className="input-field"
                  required
                >
                  <option value="punctuality">Punctuality</option>
                  <option value="customer_feedback">Customer Feedback</option>
                  <option value="task_completion">Task Completion</option>
                  <option value="quality">Quality</option>
                  <option value="teamwork">Teamwork</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Score (0-5)</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={metricForm.score}
                  onChange={(e) => setMetricForm(prev => ({ ...prev, score: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Period Start</label>
                  <input
                    type="date"
                    value={metricForm.period_start}
                    onChange={(e) => setMetricForm(prev => ({ ...prev, period_start: e.target.value }))}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Period End</label>
                  <input
                    type="date"
                    value={metricForm.period_end}
                    onChange={(e) => setMetricForm(prev => ({ ...prev, period_end: e.target.value }))}
                    className="input-field"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={metricForm.notes}
                  onChange={(e) => setMetricForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="input-field"
                  rows="3"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddMetricModal(false)}
                  className="btn-outline"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceManagement;
