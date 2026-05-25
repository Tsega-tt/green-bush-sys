import React, { useState, useEffect } from 'react';
import api from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import {
  FiPlus,
  FiTrash2,
  FiX,
  FiUsers,
  FiCheckCircle,
  FiAlertCircle
} from 'react-icons/fi';

/**
 * Table Management Component
 * Admin interface for managing cafe tables
 */
const TableManagement = () => {
  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    number: '',
    capacity: ''
  });

  // Fetch tables
  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      setLoading(true);
      const response = await api.tables.getAll();
      const tablesData = response.data.data.tables || [];
      // Sort tables by number
      const sortedTables = tablesData.sort((a, b) => a.number - b.number);
      setTables(sortedTables);
    } catch (error) {
      console.error('Error fetching tables:', error);
      toast.error('Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const tableNumber = parseInt(formData.number, 10);
      const tableCapacity = parseInt(formData.capacity, 10);

      if (!Number.isFinite(tableNumber) || tableNumber <= 0) {
        toast.error('Please enter a valid table number');
        return;
      }

      if (!Number.isFinite(tableCapacity) || tableCapacity <= 0) {
        toast.error('Please enter a valid capacity');
        return;
      }

      if (tables.length >= 20) {
        toast.error('Maximum of 20 tables allowed');
        return;
      }

      const existingTable = tables.find(t => t.number === tableNumber);
      if (existingTable) {
        toast.error(`Table ${tableNumber} already exists`);
        return;
      }

      await api.tables.create({
        number: tableNumber,
        capacity: tableCapacity
      });

      toast.success(`Table ${tableNumber} created successfully`);
      setShowAddModal(false);
      setFormData({ number: '', capacity: '' });
      fetchTables();
    } catch (error) {
      console.error('Error creating table:', error);
      const errorMessage = error.response?.data?.message || 'Failed to create table';
      toast.error(errorMessage);
    }
  };

  const handleDelete = async (table) => {
    if (table.status === 'occupied') {
      toast.error(`Cannot delete Table ${table.number} - it is currently occupied`);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete Table ${table.number}?`)) {
      return;
    }

    try {
      await api.tables.delete(table.id);
      toast.success(`Table ${table.number} deleted successfully`);
      fetchTables();
    } catch (error) {
      console.error('Error deleting table:', error);
      const errorMessage = error.response?.data?.message || 'Failed to delete table';
      toast.error(errorMessage);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading tables..." />;
  }

  const availableTables = tables.filter(t => t.status === 'available').length;
  const occupiedTables = tables.filter(t => t.status === 'occupied').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Table Management</h1>
          <p className="text-gray-600 mt-1">Manage your cafe tables</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary flex items-center space-x-2"
          disabled={tables.length >= 20}
        >
          <FiPlus className="w-5 h-5" />
          <span>Add Table</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Tables</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{tables.length}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-500">
              <FiUsers className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Available</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{availableTables}</p>
            </div>
            <div className="p-3 rounded-full bg-green-500">
              <FiCheckCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Occupied</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{occupiedTables}</p>
            </div>
            <div className="p-3 rounded-full bg-orange-500">
              <FiAlertCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">All Tables</h3>
          <p className="text-sm text-gray-600">Maximum 20 tables allowed</p>
        </div>
        
        {tables.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tables.map((table) => (
              <div
                key={table.id}
                className={`p-4 rounded-lg border-2 ${
                  table.status === 'occupied'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-green-500 bg-green-50'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-xl font-bold text-gray-900">
                      Table {table.number}
                    </h4>
                    <p className="text-sm text-gray-600">
                      Capacity: {table.capacity} {table.capacity === 1 ? 'person' : 'people'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(table)}
                    className={`p-2 rounded-lg transition-colors ${
                      table.status === 'occupied'
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-red-600 hover:bg-red-100'
                    }`}
                    disabled={table.status === 'occupied'}
                    title={table.status === 'occupied' ? 'Cannot delete occupied table' : 'Delete table'}
                  >
                    <FiTrash2 className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      table.status === 'occupied'
                        ? 'bg-orange-200 text-orange-800'
                        : 'bg-green-200 text-green-800'
                    }`}
                  >
                    {table.status === 'occupied' ? 'Occupied' : 'Available'}
                  </span>
                  {table.status === 'occupied' && table.waiter_name && (
                    <span className="text-xs text-gray-600">
                      {table.waiter_name}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <FiUsers className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No tables found</p>
            <p className="text-gray-400 text-sm mt-2">Click "Add Table" to create your first table</p>
          </div>
        )}
      </div>

      {/* Add Table Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Add New Table</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setFormData({ number: '', capacity: '' });
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Table Number *
                </label>
                <input
                  type="number"
                  name="number"
                  value={formData.number}
                  onChange={handleInputChange}
                  className="input-field"
                  placeholder="e.g., 13"
                  min="1"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Capacity (People) *
                </label>
                <input
                  type="number"
                  name="capacity"
                  value={formData.capacity}
                  onChange={handleInputChange}
                  className="input-field"
                  placeholder="e.g., 4"
                  min="1"
                  required
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setFormData({ number: '', capacity: '' });
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                >
                  Create Table
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableManagement;
