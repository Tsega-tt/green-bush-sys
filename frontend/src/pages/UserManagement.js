import React, { useState, useEffect } from 'react';
import api from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  FiPlus,
  FiEdit3,
  FiTrash2,
  FiToggleLeft,
  FiToggleRight,
  FiSearch,
  FiFilter,
  FiUser,
  FiShield
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * User Management Page Component
 * Admin interface for managing system users
 */
const UserManagement = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    username: '',
    email: '',
    password: '',
    pin: '',
    role: 'cafe_waiter',
    is_active: true
  });
  const [authMode, setAuthMode] = useState('password'); // 'password' or 'pin'

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const response = await api.users.getAll();
        setUsers(response.data.data.users);
        setFilteredUsers(response.data.data.users);
      } catch (error) {
        console.error('Error fetching users:', error);
        toast.error('Failed to load users');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // Filter users
  useEffect(() => {
    let filtered = users;

    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterRole !== 'all') {
      filtered = filtered.filter(user => user.role === filterRole);
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(user => 
        filterStatus === 'active' ? user.is_active : !user.is_active
      );
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm, filterRole, filterStatus]);

  // Toggle user status
  const toggleUserStatus = async (userId) => {
    try {
      await api.users.toggleStatus(userId);
      toast.success('User status updated successfully');
      
      // Refresh users
      const response = await api.users.getAll();
      setUsers(response.data.data.users);
    } catch (error) {
      console.error('Error toggling user status:', error);
      toast.error('Failed to update user status');
    }
  };

  // Get role display name
  const getRoleDisplayName = (role) => {
    const roleNames = {
      admin: 'Administrator',
      bakery_employee: 'Bakery Employee',
      cafe_waiter: 'Café Waiter',
      cashier: 'Cashier',
      kitchen_staff: 'Kitchen Staff',
      hr_admin: 'HR Admin',
      store_admin: 'Store Admin',
      store_manager: 'Store Manager',
      fnb_manager: 'F&B Manager',
      purchaser: 'Purchaser',
      owner: 'Owner',
      item_request: 'Item Requester',
    };
    return roleNames[role] || role;
  };

  // Get role color
  const getRoleColor = (role) => {
    const colors = {
      admin: 'bg-purple-500 text-white',
      bakery_employee: 'bg-orange-500 text-white',
      cafe_waiter: 'bg-blue-500 text-white',
      cashier: 'bg-green-500 text-white',
      kitchen_staff: 'bg-red-500 text-white',
      hr_admin: 'bg-pink-500 text-white',
      store_admin: 'bg-teal-500 text-white',
      store_manager: 'bg-teal-600 text-white',
      fnb_manager: 'bg-amber-500 text-white',
      purchaser: 'bg-indigo-500 text-white',
      owner: 'bg-yellow-700 text-white',
      item_request: 'bg-cyan-600 text-white',
    };
    return colors[role] || 'bg-gray-500 text-white';
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle add user
  const handleAddUser = () => {
    setFormData({
      full_name: '',
      username: '',
      email: '',
      password: '',
      pin: '',
      role: 'cafe_waiter',
      is_active: true
    });
    setAuthMode('password');
    setShowAddModal(true);
  };

  // Handle edit user
  const handleEditUser = (user) => {
    setSelectedUser(user);
    setFormData({
      full_name: user.full_name,
      username: user.username,
      email: user.email,
      password: '',
      pin: '',
      role: user.role,
      is_active: user.is_active
    });
    setAuthMode('password');
    setShowEditModal(true);
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (showAddModal) {
        const submitData = { ...formData };
        // Only send the authentication method being used
        if (authMode === 'password') {
          delete submitData.pin;
        } else {
          delete submitData.password;
        }
        await api.users.create(submitData);
        toast.success('User created successfully');
        setShowAddModal(false);
      } else if (showEditModal) {
        const updateData = { ...formData };
        if (authMode === 'password') {
          delete updateData.pin;
          if (!updateData.password) {
            delete updateData.password; // Don't update password if empty
          }
        } else {
          delete updateData.password;
          if (!updateData.pin) {
            delete updateData.pin; // Don't update PIN if empty
          }
        }
        await api.users.update(selectedUser.id, updateData);
        toast.success('User updated successfully');
        setShowEditModal(false);
      }
      
      // Refresh users
      const response = await api.users.getAll();
      setUsers(response.data.data.users);
    } catch (error) {
      console.error('Error saving user:', error);
      toast.error('Failed to save user');
    }
  };

  // Handle delete user
  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await api.users.delete(userId);
        toast.success('User deleted successfully');
        
        // Refresh users
        const response = await api.users.getAll();
        setUsers(response.data.data.users);
      } catch (error) {
        console.error('Error deleting user:', error);
        toast.error('Failed to delete user');
      }
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading users..." />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-1">
            Manage system users and their permissions
          </p>
        </div>
        <button 
          onClick={handleAddUser}
          className="btn-primary flex items-center space-x-2"
        >
          <FiPlus className="w-4 h-4" />
          <span>Add User</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{users.length}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-500">
              <FiUser className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-2xl font-bold text-green-600">
                {users.filter(user => user.is_active).length}
              </p>
            </div>
            <div className="p-3 rounded-full bg-green-500">
              <FiUser className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Admins</p>
              <p className="text-2xl font-bold text-purple-600">
                {users.filter(user => user.role === 'admin').length}
              </p>
            </div>
            <div className="p-3 rounded-full bg-purple-500">
              <FiShield className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Employees</p>
              <p className="text-2xl font-bold text-orange-600">
                {users.filter(user => user.role === 'bakery_employee').length}
              </p>
            </div>
            <div className="p-3 rounded-full bg-orange-500">
              <FiUser className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Staff</p>
              <p className="text-2xl font-bold text-blue-600">
                {users.filter(user => ['cafe_waiter', 'cashier', 'kitchen_staff'].includes(user.role)).length}
              </p>
            </div>
            <div className="p-3 rounded-full bg-blue-500">
              <FiUser className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiSearch className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="input-field"
          >
            <option value="all">All Roles</option>
            <option value="admin">Administrator</option>
            <option value="hr_admin">HR Admin</option>
            <option value="store_admin">Store Admin</option>
            <option value="store_manager">Store Manager</option>
            <option value="fnb_manager">F&B Manager</option>
            <option value="purchaser">Purchaser</option>
            <option value="bakery_employee">Bakery Employee</option>
            <option value="cafe_waiter">Café Waiter</option>
            <option value="cashier">Cashier</option>
            <option value="kitchen_staff">Kitchen Staff</option>
            <option value="owner">Owner</option>
            <option value="item_request">Item Requester</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>Total: {filteredUsers.length}</span>
          </div>
        </div>
      </div>

      {/* Users List */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header text-left py-3 px-4">User</th>
                <th className="table-header text-left py-3 px-4">Role</th>
                <th className="table-header text-left py-3 px-4">Email</th>
                <th className="table-header text-left py-3 px-4">Status</th>
                <th className="table-header text-left py-3 px-4">Created</th>
                <th className="table-header text-left py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="table-cell">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getRoleColor(user.role)}`}>
                        <span className="text-sm font-medium">
                          {user.full_name?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{user.full_name}</p>
                        <p className="text-sm text-gray-600">@{user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                      {getRoleDisplayName(user.role)}
                    </span>
                  </td>
                  <td className="table-cell text-gray-600">{user.email}</td>
                  <td className="table-cell">
                    <span className={`badge ${user.is_active ? 'badge-success' : 'badge-error'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell text-gray-600">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => toggleUserStatus(user.id)}
                        className="p-1 text-gray-600 hover:text-blue-600"
                      >
                        {user.is_active ? (
                          <FiToggleRight className="w-5 h-5 text-green-500" />
                        ) : (
                          <FiToggleLeft className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                      <button 
                        onClick={() => handleEditUser(user)}
                        className="p-1 text-gray-600 hover:text-blue-600"
                      >
                        <FiEdit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-1 text-gray-600 hover:text-red-600"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <FiFilter className="w-12 h-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No users found
            </h3>
            <p className="text-gray-600 mb-4">
              Try adjusting your search or filter criteria
            </p>
            <button className="btn-primary">
              Add First User
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit User Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div className="bg-white rounded-lg w-full max-w-md mx-auto p-4 sm:p-6 my-8 max-h-[calc(100vh-4rem)] sm:max-h-[calc(100vh-6rem)] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {showAddModal ? 'Add New User' : 'Edit User'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                />
              </div>
              
              {/* Authentication Mode Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Authentication Method
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="authMode"
                      value="password"
                      checked={authMode === 'password'}
                      onChange={(e) => setAuthMode(e.target.value)}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">Password</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="authMode"
                      value="pin"
                      checked={authMode === 'pin'}
                      onChange={(e) => setAuthMode(e.target.value)}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">4-Digit PIN</span>
                  </label>
                </div>
              </div>

              {/* Password or PIN Input */}
              {authMode === 'password' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password {showEditModal && '(leave blank to keep current)'}
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="input-field"
                    required={showAddModal}
                    placeholder="Min 6 chars with uppercase, lowercase, and number"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    4-Digit PIN {showEditModal && '(leave blank to keep current)'}
                  </label>
                  <input
                    type="tel"
                    name="pin"
                    value={formData.pin}
                    onChange={handleInputChange}
                    className="input-field"
                    required={showAddModal}
                    placeholder="Enter 4-digit PIN"
                    maxLength="4"
                    pattern="\d{4}"
                    inputMode="numeric"
                    enterKeyHint="done"
                    style={{ WebkitTextSecurity: 'disc' }}
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                >
                  <option value="admin">Administrator</option>
                  <option value="hr_admin">HR Admin</option>
                  <option value="store_admin">Store Admin</option>
                  <option value="store_manager">Store Manager</option>
                  <option value="fnb_manager">F&B Manager</option>
                  <option value="purchaser">Purchaser</option>
                  <option value="bakery_employee">Bakery Employee</option>
                  <option value="cafe_waiter">Café Waiter</option>
                  <option value="cashier">Cashier</option>
                  <option value="kitchen_staff">Kitchen Staff</option>
                  <option value="owner">Owner</option>
                  <option value="item_request">Item Requester</option>
                </select>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  Active User
                </label>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                  }}
                  className="btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  {showAddModal ? 'Create User' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
