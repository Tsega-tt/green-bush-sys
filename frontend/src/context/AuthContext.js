import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

// Create Auth Context
const AuthContext = createContext();

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Auth Provider Component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const normalizeUser = (raw) => {
    const u = raw && typeof raw === 'object' ? { ...raw } : null;
    if (!u) return null;
    const idCandidate = u.id ?? u.user_id ?? u.userId ?? null;
    const id = idCandidate != null ? parseInt(idCandidate, 10) : null;
    if (Number.isFinite(id)) u.id = id;
    return u;
  };

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = () => {
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const userData = normalizeUser(JSON.parse(storedUser));
          setUser(userData);
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Login function
  const login = async (credentials, loginType = 'traditional', silent = false) => {
    try {
      setLoading(true);
      
      let response;
      if (loginType === 'pin') {
        response = await api.auth.pinLogin(credentials);
      } else if (loginType === 'staff') {
        // For staff login, use staffLogin with name and password
        response = await api.auth.staffLogin(credentials);
      } else {
        response = await api.auth.login(credentials);
      }
      
      console.log('🔐 Login response:', response);
      const data = response?.data || {};
      console.log('📦 Response data:', data);
      const isSuccess = data.status === 'success' || data.success === true;
      const userData = data?.data?.user || data?.user;
      console.log('✅ isSuccess:', isSuccess, 'userData:', userData);
      
      if (isSuccess && userData) {
        const normalized = normalizeUser(userData);
        setUser(normalized);
        setIsAuthenticated(true);
        localStorage.setItem('user', JSON.stringify(normalized));
        return { success: true, user: normalized };
      }
      
      const message = data.message || data.error || 'Login failed';
      console.log('❌ Login failed:', message);
      if (!silent) {
        toast.error(message);
      }
      return { success: false, error: message };
    } catch (error) {
      console.error('💥 Login error:', error);
      console.error('💥 Error response:', error.response);
      const message = error.response?.data?.message || error.response?.data?.error || 'Login failed';
      if (!silent) {
        toast.error(message);
      }
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  // Register function
  const register = async (userData) => {
    try {
      setLoading(true);
      const response = await api.auth.register(userData);
      
      if (response.data.status === 'success') {
        toast.success('Registration successful! Please login.');
        return { success: true };
      }
    } catch (error) {
      console.error('Registration error:', error);
      const message = error.response?.data?.message || 'Registration failed';
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('user');
    } catch (e) {
      // ignore
    }

    try {
      api.auth.logout().catch((error) => {
        console.error('Logout error:', error);
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    toast.success('Logged out successfully');
  };

  // Update user profile
  const updateProfile = async (userId, profileData) => {
    try {
      const response = await api.auth.updateProfile(userId, profileData);
      
      if (response.data.status === 'success') {
        const updatedUser = normalizeUser(response.data.data.user);
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        toast.success('Profile updated successfully');
        return { success: true, user: updatedUser };
      }
    } catch (error) {
      console.error('Profile update error:', error);
      const message = error.response?.data?.message || 'Profile update failed';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const changePassword = async (userId, currentPassword, newPassword) => {
    try {
      const response = await api.auth.changePassword(userId, {
        current_password: currentPassword,
        new_password: newPassword,
      });

      const data = response?.data || {};
      const isSuccess = data.status === 'success' || data.success === true;
      if (isSuccess) {
        toast.success(data.message || 'Password updated successfully');
        return { success: true };
      }

      const message = data.message || data.error || 'Failed to update password';
      toast.error(message);
      return { success: false, error: message };
    } catch (error) {
      console.error('Change password error:', error);
      const message = error.response?.data?.message || error.response?.data?.error || 'Failed to update password';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  // Check if user has specific role
  const hasRole = (role) => {
    return user?.role === role;
  };

  // Check if user has any of the specified roles
  const hasAnyRole = (roles) => {
    return roles.includes(user?.role);
  };

  // Check if user is admin
  const isAdmin = () => {
    return user?.role === 'admin';
  };

  // Get user's role display name
  const getRoleDisplayName = (role = user?.role) => {
    const roleNames = {
      admin: 'Administrator',
      bakery_employee: 'Bakery Employee',
      cafe_waiter: 'Café Waiter',
      cashier: 'Cashier',
      kitchen_staff: 'Kitchen Staff',
      hr_admin: 'HR Admin',
      store_admin: 'Store Admin',
      fnb_manager: 'F&B Manager',
      owner: 'Owner',
      item_request: 'Item Requester',
    };
    return roleNames[role] || role;
  };

  const isStoreAdmin  = () => user?.role === 'store_admin';
  const isFnbManager  = () => user?.role === 'fnb_manager';
  const isHRAdmin     = () => user?.role === 'hr_admin';
  const isOwner          = () => user?.role === 'owner';
  const isItemRequester   = () => user?.role === 'item_request';

  // Context value
  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    hasRole,
    hasAnyRole,
    isAdmin,
    isStoreAdmin,
    isFnbManager,
    isHRAdmin,
    isOwner,
    isItemRequester,
    getRoleDisplayName,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
