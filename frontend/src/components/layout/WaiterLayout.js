import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiLogOut, FiClipboard, FiPlus } from 'react-icons/fi';
import toast from 'react-hot-toast';
import BranchBadge from '../common/BranchBadge';

/**
 * Simplified Layout Component for Waiters
 * Only shows order creation and history navigation
 */
const WaiterLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Error logging out');
    }
  };

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo/Brand */}
            <div className="flex items-center space-x-2">
              <div className="flex-shrink-0">
                <img
                  src="/assets/logo.png"
                  alt="Logo"
                  className="w-10 h-10 object-contain"
                />
              </div>
              <BranchBadge />
            </div>

            {/* Navigation Links */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/waiter/create-order')}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/waiter/create-order')
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <FiPlus className="w-4 h-4 mr-2" />
                New Order
              </button>
              
              <button
                onClick={() => navigate('/waiter/order-history')}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/waiter/order-history')
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <FiClipboard className="w-4 h-4 mr-2" />
                Order History
              </button>
            </div>

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-700">
                <span className="font-medium">{user?.name}</span>
                <span className="text-gray-500 ml-2">Waiter</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <FiLogOut className="w-4 h-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
};

export default WaiterLayout;
