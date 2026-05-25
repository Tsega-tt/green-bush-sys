import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { DashboardFilterProvider, useDashboardFilters } from '../../context/DashboardFilterContext';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FiMenu,
  FiX,
  FiHome,
  FiUsers,
  FiShoppingBag,
  FiClipboard,
  FiCreditCard,
  FiClock,
  FiBarChart2,
  FiSettings,
  FiLogOut,
  FiUser,
  FiCoffee,
  FiTool,
  FiDollarSign,
  FiPackage,
  FiArchive,
  FiSend,
  FiCheckSquare,
  FiGrid,
  FiFileText,
  FiTruck
} from 'react-icons/fi';
import BranchBadge from '../common/BranchBadge';

const SidebarFilters = () => {
  const {
    enabled,
    businessUnit,
    setBusinessUnit,
    selectedMenuItemId,
    setSelectedMenuItemId,
    menuItemsForSelectedUnit,
    loadingMenuItems,
  } = useDashboardFilters();

  if (!enabled) return null;

  return (
    <div className="px-6 py-4 border-b border-gray-200">
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
        Filters
      </div>
      <div className="space-y-2">
        <select
          value={businessUnit}
          onChange={(e) => setBusinessUnit(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50"
        >
          <option value="all">All</option>
          <option value="restaurant">Restaurant</option>
          <option value="cafe">Cafe</option>
          <option value="barista">Barista</option>
        </select>

        <select
          value={selectedMenuItemId}
          onChange={(e) => setSelectedMenuItemId(e.target.value)}
          disabled={businessUnit === 'all' || loadingMenuItems}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500"
        >
          <option value="all">{loadingMenuItems ? 'Loading...' : 'All Foods'}</option>
          {menuItemsForSelectedUnit.map((it) => (
            <option key={it.id} value={String(it.id)}>
              {it.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

/**
 * Dashboard Layout Component
 * Provides the main layout structure with sidebar navigation
 */
const DashboardLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, getRoleDisplayName } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const filtersEnabled = user?.role === 'admin' || user?.role === 'cashier';
  const NEW_ROLES = ['hr_admin', 'store_admin', 'fnb_manager'];

  // Navigation items based on user role
  const getNavigationItems = () => {
    const baseItems = [
      { name: 'Dashboard', href: '/dashboard', icon: FiHome, roles: ['all'] },
      { name: 'Profile', href: '/dashboard/profile', icon: FiUser, roles: ['all'] },
    ];

    const roleSpecificItems = [
      // Admin items
      { name: 'Employee Management', href: '/dashboard/employees', icon: FiUsers, roles: ['admin'] },
      { name: 'User Management', href: '/dashboard/users', icon: FiUsers, roles: ['admin'] },
      { name: 'Menu Management', href: '/dashboard/menu', icon: FiShoppingBag, roles: ['admin'] },
      { name: 'Storage (Inventory)', href: '/dashboard/inventory', icon: FiPackage, roles: ['admin'] },
      { name: 'Expense Management', href: '/dashboard/expenses', icon: FiDollarSign, roles: ['admin'] },
      { name: 'Reports', href: '/dashboard/reports', icon: FiBarChart2, roles: ['admin'] },
      { name: 'Attendance', href: '/dashboard/attendance', icon: FiClock, roles: ['admin'] },
      
      // Orders (multiple roles)
      { name: 'Orders', href: '/dashboard/orders', icon: FiClipboard, roles: ['admin', 'bakery_employee', 'cafe_waiter', 'kitchen_staff'] },
      
      // Payments (cashier and admin)
      { name: 'Payments', href: '/dashboard/payments', icon: FiCreditCard, roles: ['admin', 'cashier'] },
      { name: 'Payments Items', href: '/dashboard/payments-items', icon: FiCreditCard, roles: ['admin', 'cashier'] },

      // Cashier employee selection
      { name: 'Employees', href: '/dashboard/cashier/employees', icon: FiUsers, roles: ['cashier'] },

      // Beu Delivery (cashier + admin only — no waiter access)
      { name: 'Beu Delivery', href: '/dashboard/beu-delivery', icon: FiTruck, roles: ['cashier', 'admin'] },

      // HR Admin items
      { name: 'User Management',   href: '/dashboard/users',     icon: FiUsers,      roles: ['hr_admin'] },
      { name: 'Employee Management', href: '/dashboard/employees', icon: FiUser,     roles: ['hr_admin'] },

      // Store Admin items
      { name: 'Store Inventory',      href: '/dashboard/store-inventory',        icon: FiArchive,   roles: ['store_admin', 'fnb_manager', 'admin'] },
      { name: 'Item Requests',        href: '/dashboard/item-requests',          icon: FiSend,      roles: ['store_admin', 'fnb_manager', 'admin', 'item_request'] },
      { name: 'Purchase Requisitions', href: '/dashboard/purchase-requisitions', icon: FiFileText,  roles: ['store_admin', 'fnb_manager', 'owner', 'admin'] },

    ];

    return [...baseItems, ...roleSpecificItems].filter(item => 
      item.roles.includes('all') || item.roles.includes(user?.role)
    );
  };

  const navigationItems = getNavigationItems();

  // Handle logout
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Check if current path is active
  const isActive = (href) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  // Get role-specific color scheme
  const getRoleColors = () => {
    const colors = {
      admin: 'bg-purple-500 text-white',
      bakery_employee: 'bg-orange-500 text-white',
      cafe_waiter: 'bg-blue-500 text-white',
      cashier: 'bg-green-500 text-white',
      kitchen_staff: 'bg-red-500 text-white',
      hr_admin: 'bg-pink-500 text-white',
      store_admin: 'bg-teal-500 text-white',
      fnb_manager: 'bg-amber-500 text-white',
      owner: 'bg-yellow-700 text-white',
      item_request: 'bg-cyan-600 text-white',
    };
    return colors[user?.role] || 'bg-gray-500 text-white';
  };

  // Get role icon
  const getRoleIcon = () => {
    const icons = {
      admin: FiSettings,
      bakery_employee: FiPackage,
      cafe_waiter: FiCoffee,
      cashier: FiDollarSign,
      kitchen_staff: FiTool,
      hr_admin: FiUsers,
      store_admin: FiArchive,
      fnb_manager: FiGrid,
      owner: FiFileText,
      item_request: FiSend,
    };
    const IconComponent = icons[user?.role] || FiUser;
    return <IconComponent className="w-5 h-5" />;
  };

  return (
    <DashboardFilterProvider enabled={filtersEnabled}>
      <div className="flex h-screen bg-gray-50">
        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:inset-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex flex-col h-full">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <div className="flex flex-col">
                  <img
                    src="/assets/logo.png"
                    alt="Logo"
                    className="w-10 h-10 object-contain"
                  />
                  <a
                    href="https://syntaxsoftwaresolution.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-semibold tracking-wide bg-gradient-to-r from-primary-600 via-purple-600 to-secondary-600 bg-clip-text text-transparent leading-none mt-1"
                  >
                    developed by syntax software solution
                  </a>
                </div>
                <BranchBadge />
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1 rounded-md hover:bg-gray-100"
              >
                <FiX className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            {/* User Info */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-full ${getRoleColors()}`}>
                  {getRoleIcon()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user?.full_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {getRoleDisplayName()}
                  </p>
                </div>
              </div>
            </div>

            {filtersEnabled && <SidebarFilters />}

            {/* Navigation */}
            <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
              {navigationItems.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.name}
                    onClick={() => {
                      navigate(item.href);
                      setSidebarOpen(false);
                    }}
                    className={`
                      w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200
                      ${isActive(item.href)
                        ? 'bg-primary-100 text-primary-700 border-r-2 border-primary-500'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                  >
                    <IconComponent className="w-5 h-5 mr-3" />
                    {item.name}
                  </button>
                );
              })}
            </nav>

            {/* Logout Button */}
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
              >
                <FiLogOut className="w-5 h-5 mr-3" />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
          {/* Top Header */}
          <header className="bg-white shadow-sm border-b border-gray-200 lg:hidden">
            <div className="flex items-center justify-between h-16 px-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-md hover:bg-gray-100"
              >
                <FiMenu className="w-6 h-6 text-gray-600" />
              </button>
              <div className="flex items-center space-x-2">
                <img
                  src="/assets/logo.png"
                  alt="Logo"
                  className="w-10 h-10 object-contain"
                />
                <BranchBadge />
              </div>
              <div className="w-10"></div> {/* Spacer for centering */}
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto bg-gray-50">
            <div className="h-full">
              {children}
            </div>
          </main>
        </div>

        {/* Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </div>
    </DashboardFilterProvider>
  );
};

export default DashboardLayout;
