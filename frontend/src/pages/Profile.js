import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ButtonSpinner } from '../components/common/LoadingSpinner';
import {
  FiUser,
  FiMail,
  FiEdit3,
  FiSave,
  FiX,
  FiShield,
  FiLogOut
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * Profile Page Component
 * User profile management interface
 */
const Profile = () => {
  const { user, updateProfile, changePassword, getRoleDisplayName, logout } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    username: user?.username || ''
  });
  const [errors, setErrors] = useState({});

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  // Validate form
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    
    try {
      const result = await updateProfile(user.id, formData);
      
      if (result.success) {
        setIsEditing(false);
        toast.success('Profile updated successfully!');
      }
    } catch (error) {
      console.error('Profile update error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel editing
  const handleCancel = () => {
    setFormData({
      full_name: user?.full_name || '',
      email: user?.email || '',
      username: user?.username || ''
    });
    setErrors({});
    setIsEditing(false);
  };

  const isWaiter = user?.role === 'cafe_waiter';

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      // logout already handles errors/toast
    }
  };

  const handlePasswordFieldChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({ ...prev, [name]: value }));
    if (passwordErrors[name]) {
      setPasswordErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validatePasswordForm = () => {
    const newErrors = {};

    if (!passwordForm.currentPassword) {
      newErrors.currentPassword = isWaiter ? 'Current PIN is required' : 'Current password is required';
    }

    if (!passwordForm.newPassword) {
      newErrors.newPassword = isWaiter ? 'New PIN is required' : 'New password is required';
    } else {
      if (isWaiter) {
        if (!/^\d{4}$/.test(passwordForm.newPassword)) {
          newErrors.newPassword = 'PIN must be exactly 4 digits';
        }
      } else if (passwordForm.newPassword.length < 6) {
        newErrors.newPassword = 'Password must be at least 6 characters';
      }
    }

    if (passwordForm.confirmPassword !== passwordForm.newPassword) {
      newErrors.confirmPassword = isWaiter ? 'PIN confirmation does not match' : 'Password confirmation does not match';
    }

    setPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submitPasswordChange = async (e) => {
    e.preventDefault();
    if (!validatePasswordForm()) return;
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const result = await changePassword(user.id, passwordForm.currentPassword, passwordForm.newPassword);
      if (result.success) {
        setShowChangePassword(false);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setPasswordErrors({});
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Get role color
  const getRoleColor = () => {
    const colors = {
      admin: 'bg-purple-500',
      bakery_employee: 'bg-orange-500',
      cafe_waiter: 'bg-blue-500',
      cashier: 'bg-green-500',
      kitchen_staff: 'bg-red-500'
    };
    return colors[user?.role] || 'bg-gray-500';
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
          {isWaiter && (
            <button
              type="button"
              onClick={handleLogout}
              className="btn-outline flex items-center space-x-2"
              disabled={isLoading}
            >
              <FiLogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          )}
        </div>
        <p className="text-gray-600 mt-1">
          Manage your account information and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="lg:col-span-1">
          <div className="card text-center">
            {/* Avatar */}
            <div className="flex justify-center mb-4">
              <div className={`w-24 h-24 ${getRoleColor()} rounded-full flex items-center justify-center`}>
                <span className="text-3xl font-bold text-white">
                  {user?.full_name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
            </div>

            {/* User Info */}
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {user?.full_name}
            </h2>
            <p className="text-gray-600 mb-2">@{user?.username}</p>
            
            {/* Role Badge */}
            <div className="flex justify-center mb-4">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white ${getRoleColor()}`}>
                <FiShield className="w-4 h-4 mr-1" />
                {getRoleDisplayName()}
              </span>
            </div>

            {/* Account Status */}
            <div className="text-sm text-gray-500">
              <p>Account Status: 
                <span className={`ml-1 font-medium ${user?.is_active ? 'text-green-600' : 'text-red-600'}`}>
                  {user?.is_active ? 'Active' : 'Inactive'}
                </span>
              </p>
              <p className="mt-1">
                Member since: {new Date(user?.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-semibold text-gray-900">
                Account Information
              </h3>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="btn-outline flex items-center space-x-2"
                >
                  <FiEdit3 className="w-4 h-4" />
                  <span>Edit Profile</span>
                </button>
              ) : (
                <div className="flex space-x-2">
                  <button
                    onClick={handleCancel}
                    className="btn-outline text-gray-600 border-gray-300"
                    disabled={isLoading}
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="btn-primary flex items-center space-x-2"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ButtonSpinner />
                    ) : (
                      <FiSave className="w-4 h-4" />
                    )}
                    <span>Save</span>
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Full Name */}
              <div>
                <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiUser className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="full_name"
                    name="full_name"
                    type="text"
                    value={formData.full_name}
                    onChange={handleChange}
                    disabled={!isEditing || isLoading}
                    className={`input-field pl-10 ${errors.full_name ? 'border-red-500' : ''} ${!isEditing ? 'bg-gray-50' : ''}`}
                    placeholder="Enter your full name"
                  />
                </div>
                {errors.full_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.full_name}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiMail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={!isEditing || isLoading}
                    className={`input-field pl-10 ${errors.email ? 'border-red-500' : ''} ${!isEditing ? 'bg-gray-50' : ''}`}
                    placeholder="Enter your email address"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                )}
              </div>

              {/* Username */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400">@</span>
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    value={formData.username}
                    onChange={handleChange}
                    disabled={!isEditing || isLoading}
                    className={`input-field pl-8 ${errors.username ? 'border-red-500' : ''} ${!isEditing ? 'bg-gray-50' : ''}`}
                    placeholder="Enter your username"
                  />
                </div>
                {errors.username && (
                  <p className="mt-1 text-sm text-red-600">{errors.username}</p>
                )}
              </div>

              {/* Role (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiShield className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={getRoleDisplayName()}
                    disabled
                    className="input-field pl-10 bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Role cannot be changed. Contact an administrator for role changes.
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account Details */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Account Details
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">User ID:</span>
              <span className="font-medium">#{user?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Created:</span>
              <span className="font-medium">
                {new Date(user?.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Last Updated:</span>
              <span className="font-medium">
                {new Date(user?.updated_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className={`font-medium ${user?.is_active ? 'text-green-600' : 'text-red-600'}`}>
                {user?.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Quick Actions
          </h3>
          <div className="space-y-3">
            <button
              className="w-full btn-outline text-left"
              type="button"
              onClick={() => setShowChangePassword(true)}
            >
              Change Password
            </button>
            <button className="w-full btn-outline text-left">
              Download Data
            </button>
            <button className="w-full btn-outline text-left">
              Privacy Settings
            </button>
          </div>
        </div>
      </div>

      {showChangePassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div className="bg-white rounded-lg w-full max-w-md mx-auto p-4 sm:p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {isWaiter ? 'Change PIN' : 'Change Password'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (isLoading) return;
                  setShowChangePassword(false);
                  setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  setPasswordErrors({});
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <form onSubmit={submitPasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isWaiter ? 'Current PIN' : 'Current Password'}
                </label>
                <input
                  type={isWaiter ? 'tel' : 'password'}
                  name="currentPassword"
                  value={passwordForm.currentPassword}
                  onChange={handlePasswordFieldChange}
                  className={`input-field ${passwordErrors.currentPassword ? 'border-red-500' : ''}`}
                  disabled={isLoading}
                  autoComplete="current-password"
                  inputMode={isWaiter ? 'numeric' : undefined}
                  maxLength={isWaiter ? 4 : undefined}
                  style={isWaiter ? { WebkitTextSecurity: 'disc' } : undefined}
                />
                {passwordErrors.currentPassword && (
                  <p className="mt-1 text-sm text-red-600">{passwordErrors.currentPassword}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isWaiter ? 'New PIN' : 'New Password'}
                </label>
                <input
                  type={isWaiter ? 'tel' : 'password'}
                  name="newPassword"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordFieldChange}
                  className={`input-field ${passwordErrors.newPassword ? 'border-red-500' : ''}`}
                  disabled={isLoading}
                  autoComplete="new-password"
                  inputMode={isWaiter ? 'numeric' : undefined}
                  maxLength={isWaiter ? 4 : undefined}
                  style={isWaiter ? { WebkitTextSecurity: 'disc' } : undefined}
                />
                {passwordErrors.newPassword && (
                  <p className="mt-1 text-sm text-red-600">{passwordErrors.newPassword}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm {isWaiter ? 'PIN' : 'Password'}
                </label>
                <input
                  type={isWaiter ? 'tel' : 'password'}
                  name="confirmPassword"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordFieldChange}
                  className={`input-field ${passwordErrors.confirmPassword ? 'border-red-500' : ''}`}
                  disabled={isLoading}
                  autoComplete="new-password"
                  inputMode={isWaiter ? 'numeric' : undefined}
                  maxLength={isWaiter ? 4 : undefined}
                  style={isWaiter ? { WebkitTextSecurity: 'disc' } : undefined}
                />
                {passwordErrors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">{passwordErrors.confirmPassword}</p>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (isLoading) return;
                    setShowChangePassword(false);
                    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    setPasswordErrors({});
                  }}
                  className="btn-outline"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isLoading}
                >
                  {isLoading ? <ButtonSpinner /> : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
