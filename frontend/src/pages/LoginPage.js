import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ButtonSpinner } from '../components/common/LoadingSpinner';
import api from '../services/api';
import { 
  FiUser, 
  FiLock, 
  FiEye, 
  FiEyeOff,
  FiDelete,
  FiSettings,
  FiArrowLeft
} from 'react-icons/fi';
import BranchBadge from '../components/common/BranchBadge';

/**
 * Login Page Component
 * Circle button user selection with PIN entry
 */
const LoginPage = () => {
  const SHOW_DEMO_ACCOUNTS = false;
  const [loginPhase, setLoginPhase] = useState('user-selection'); // 'user-selection', 'pin-entry', 'admin'
  const [selectedUser, setSelectedUser] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [formData, setFormData] = useState({
    pin: '',
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [activeField, setActiveField] = useState(null);

  const { login } = useAuth();
  const navigate = useNavigate();
  const usernameRef = useRef(null);
  const pinRef = useRef(null);
  const adminUsernameRef = useRef(null);
  const adminPasswordRef = useRef(null);

  // Load employees on component mount
  useEffect(() => {
    const loadEmployees = async () => {
      console.log('Loading employees for phase:', loginPhase);

      setEmployees([]);

      try {
        const usersResponse = await api.users.getAll();

        const usersList = (usersResponse?.data?.data?.users) ?? (usersResponse?.data?.users) ?? [];
        const normalized = (Array.isArray(usersList) ? usersList : [])
          .filter(u => u && u.is_active !== false)
          .map(u => ({
            ...u,
            full_name: u.full_name || u.name || u.username || ''
          }))
          .filter(u => String(u.full_name || '').trim());

        const seen = new Set();
        const finalUsers = normalized.filter(u => {
          const key = String(u.username || u.full_name || '').trim().toLowerCase();
          if (!key) return false;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        console.log('Loaded users:', finalUsers);
        setEmployees(finalUsers);
      } catch (error) {
        console.error('Error loading users:', error);
        try {
          const waitersResponse = await api.users.getWaiters();
          const usersList = (waitersResponse?.data?.data?.users) ?? (waitersResponse?.data?.users) ?? [];
          const normalized = (Array.isArray(usersList) ? usersList : [])
            .map(u => ({
              ...u,
              full_name: u.full_name || u.name || u.username || ''
            }))
            .filter(u => String(u.full_name || '').trim());
          setEmployees(normalized);
        } catch (e) {
          console.error('Error loading waiters:', e);
          setEmployees([]);
        }
      }
    };

    if (loginPhase === 'user-selection') {
      loadEmployees();
    }
  }, [loginPhase]);

  // Handle user selection
  const handleUserSelect = (user) => {
    setSelectedUser(user);
    setLoginPhase('pin-entry');
    // Pre-fill username with the selected user's username or name
    setFormData({ 
      pin: '', 
      username: user.username || user.full_name || '', 
      password: '' 
    });
    setErrors({});
  };

  // Handle back to user selection
  const handleBackToUserSelection = () => {
    setLoginPhase('user-selection');
    setSelectedUser(null);
    setFormData(prev => ({ ...prev, pin: '' }));
    setErrors({});
  };

  // Handle input changes - wrapped in useCallback to prevent re-creation
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    setErrors(prev => {
      if (prev[name]) {
        return {
          ...prev,
          [name]: ''
        };
      }
      return prev;
    });
  }, []);

  // Dedicated handlers that aggressively keep focus on the active input
  const handleUsernameChange = useCallback((e) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, username: value }));
    setErrors(prev => (prev.username ? { ...prev, username: '' } : prev));
    setActiveField('username');
    // Keep focus anchored on username while typing
    if (usernameRef.current && document.activeElement !== usernameRef.current) {
      usernameRef.current.focus();
    }
  }, []);

  const handlePinChange = useCallback((e) => {
    let value = e.target.value || '';
    // Digits only, max 4
    value = value.replace(/\D/g, '').slice(0, 4);
    setFormData(prev => ({ ...prev, pin: value }));
    setErrors(prev => (prev.pin ? { ...prev, pin: '' } : prev));
    setActiveField('pin');
    // Keep focus anchored on PIN while typing
    if (pinRef.current && document.activeElement !== pinRef.current) {
      pinRef.current.focus();
    }
  }, []);

  // After every value change, re-focus the last active field to survive remounts/rerenders
  useEffect(() => {
    if (loginPhase === 'pin-entry') {
      if (activeField === 'username' && usernameRef.current) {
        usernameRef.current.focus();
      } else if (activeField === 'pin' && pinRef.current) {
        pinRef.current.focus();
      }
      return;
    }

    if (loginPhase === 'admin') {
      if (activeField === 'admin_username' && adminUsernameRef.current) {
        adminUsernameRef.current.focus();
      } else if (activeField === 'admin_password' && adminPasswordRef.current) {
        adminPasswordRef.current.focus();
      }
    }
  }, [formData.username, formData.pin, activeField, loginPhase]);

  // Handle PIN keypad input
  const handlePinInput = (digit) => {
    if (formData.pin.length < 4) {
      setFormData(prev => ({
        ...prev,
        pin: prev.pin + digit
      }));
      
      // Clear PIN error
      if (errors.pin) {
        setErrors(prev => ({
          ...prev,
          pin: ''
        }));
      }
    }
  };

  // Handle PIN backspace
  const handlePinBackspace = () => {
    setFormData(prev => ({
      ...prev,
      pin: prev.pin.slice(0, -1)
    }));
  };

  // Clear PIN
  const clearPin = () => {
    setFormData(prev => ({
      ...prev,
      pin: ''
    }));
  };

  // Validate form
  const validateForm = () => {
    const newErrors = {};
    
    if (loginPhase === 'pin-entry') {
      if (!formData.pin || formData.pin.length !== 4) {
        newErrors.pin = 'Please enter a 4-digit PIN';
      }
    } else if (loginPhase === 'admin') {
      if (!formData.username.trim()) {
        newErrors.username = 'Username is required';
      }
      
      if (!formData.password) {
        newErrors.password = 'Password is required';
      }
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
      let result;
      
      if (loginPhase === 'pin-entry') {
        // Use PIN login with username from form
        result = await login({ name: formData.username, pin: formData.pin }, 'pin');
      } else if (loginPhase === 'admin') {
        // Try traditional login first (for admin), then staff login (for staff with full names)
        result = await login({ username: formData.username, password: formData.password }, 'traditional');
        
        // If traditional login fails and result is not successful, try staff login
        if (!result.success) {
          result = await login({ name: formData.username, password: formData.password }, 'staff');
        }
        // If still not successful, try PIN login using the entered password as PIN
        if (!result.success) {
          result = await login({ name: formData.username, pin: formData.password }, 'pin');
        }
      }
      
      if (result.success) {
        // Redirect based on user role
        let redirectPath = '/dashboard'; // default for admin, cashier, kitchen_staff
        if (result.user.role === 'cafe_waiter') {
          redirectPath = '/waiter/create-order';
        } else if (result.user.role === 'bakery_employee') {
          redirectPath = '/bakery/create-order';
        }
        navigate(redirectPath);
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };


  // Get role-based colors
  const getRoleColors = (role) => {
    const colors = {
      bakery_employee: 'bg-orange-500 hover:bg-orange-600 border-orange-300',
      cafe_waiter: 'bg-blue-500 hover:bg-blue-600 border-blue-300',
      cashier: 'bg-green-500 hover:bg-green-600 border-green-300',
      kitchen_staff: 'bg-red-500 hover:bg-red-600 border-red-300',
      admin: 'bg-purple-500 hover:bg-purple-600 border-purple-300'
    };
    return colors[role] || 'bg-gray-500 hover:bg-gray-600 border-gray-300';
  };

  // Get user initials
  const getUserInitials = (fullName) => {
    return fullName
      .split(' ')
      .map(name => name.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // User Selection Component
  const renderUserSelectionScreen = () => {
    console.log('Rendering UserSelectionScreen with employees:', employees);
    return (
      <div className="space-y-8">
      <div className="text-center">
        <div className="flex justify-center items-center space-x-2 mb-4">
          <div className="relative">
            <img
              src="/assets/logo.png"
              alt="Logo"
              className="w-60 h-60 object-contain bg-white"
            />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-7 px-3 py-1 bg-white text-[11px] font-bold tracking-widest uppercase text-gray-800">
              - BRANCH 2 -
            </div>
          </div>
        </div>
        <BranchBadge className="mt-2" />
        <div className="mt-2 text-base sm:text-lg font-extrabold tracking-widest uppercase text-gray-800">
          Kidist Shiro -Branch-2
        </div>
        <div className="mt-2">
          <a
            href="https://syntaxsoftwaresolution.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-base sm:text-lg font-extrabold tracking-widest uppercase text-gray-800"
          >
            syntax software solution
          </a>
        </div>
      </div>

      <div className="bg-white shadow-soft rounded-2xl p-8">
        {employees.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Loading waiters...</p>
          </div>
        ) : employees.filter(e => e.role === 'cafe_waiter').length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No waiters available</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto max-h-96 overflow-y-auto">
            <div className="grid grid-cols-3 gap-4">
              {employees.filter(e => e.role === 'cafe_waiter').map((employee) => (
                <div key={employee.id} className="flex flex-col items-center space-y-2">
                  <button
                    onClick={() => handleUserSelect(employee)}
                    disabled={isLoading}
                    className={`
                      w-24 h-24 rounded-full text-white font-bold text-lg
                      transition-all duration-200 transform hover:scale-105 disabled:opacity-50
                      ${getRoleColors(employee.role)}
                      shadow-lg hover:shadow-xl flex items-center justify-center
                    `}
                  >
                    {getUserInitials(employee.full_name || employee.name || employee.username || '')}
                  </button>
                  <p className="text-xs font-medium text-gray-700 text-center max-w-20 truncate">
                    {employee.full_name || employee.name || employee.username}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-16 pt-6 border-t border-gray-200 text-center">
          <button
            onClick={() => setLoginPhase('admin')}
            className="flex items-center space-x-2 text-sm text-primary-600 hover:text-primary-700 transition-colors mx-auto"
          >
            <FiSettings className="w-4 h-4" />
            <span>Login</span>
          </button>
        </div>
      </div>
    </div>
    );
  };

  // Number keypad component
  const NumberKeypad = () => {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    
    return (
      <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {numbers.slice(0, 9).map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => handlePinInput(num.toString())}
            disabled={isLoading}
            className="h-16 text-2xl font-bold bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 hover:border-primary-300 transition-all duration-200 disabled:opacity-50"
          >
            {num}
          </button>
        ))}
        <button
          type="button"
          onClick={clearPin}
          disabled={isLoading}
          className="h-16 bg-red-100 border-2 border-red-200 rounded-xl hover:bg-red-200 transition-all duration-200 disabled:opacity-50 flex items-center justify-center"
        >
          <span className="text-red-600 font-medium">Clear</span>
        </button>
        <button
          type="button"
          onClick={() => handlePinInput('0')}
          disabled={isLoading}
          className="h-16 text-2xl font-bold bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 hover:border-primary-300 transition-all duration-200 disabled:opacity-50"
        >
          0
        </button>
        <button
          type="button"
          onClick={handlePinBackspace}
          disabled={isLoading}
          className="h-16 bg-yellow-100 border-2 border-yellow-200 rounded-xl hover:bg-yellow-200 transition-all duration-200 disabled:opacity-50 flex items-center justify-center"
        >
          <FiDelete className="w-6 h-6 text-yellow-600" />
        </button>
      </div>
    );
  };

  // PIN Entry Component - Now shows username + PIN form
  const renderPinEntryScreen = () => {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <button
            onClick={handleBackToUserSelection}
            className="flex items-center space-x-2 text-primary-600 hover:text-primary-700 transition-colors mb-4 mx-auto"
          >
            <FiArrowLeft className="w-4 h-4" />
            <span>Back to user selection</span>
          </button>
          
          <div className={`w-20 h-20 mx-auto rounded-full text-white font-bold text-xl mb-4 flex items-center justify-center ${getRoleColors(selectedUser?.role)}`}>
            {getUserInitials(selectedUser?.full_name || '')}
          </div>
          
          <BranchBadge className="mb-2" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Waiter Login
          </h2>
          <p className="text-gray-600">
            Enter your username and PIN
          </p>
        </div>

        <div className="bg-white shadow-soft rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username Input */}
            <div>
              <label htmlFor="waiter-username" className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FiUser className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="waiter-username"
                  type="text"
                  name="username"
                  ref={usernameRef}
                  value={formData.username}
                  onChange={handleUsernameChange}
                  onFocus={() => setActiveField('username')}
                  className="input-field pl-10"
                  placeholder="Enter your username"
                  disabled={isLoading}
                  autoComplete="username"
                />
              </div>
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">{errors.username}</p>
              )}
            </div>

            {/* PIN Input */}
            <div>
              <label htmlFor="waiter-pin" className="block text-sm font-medium text-gray-700 mb-2">
                PIN
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FiLock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="waiter-pin"
                  type="tel"
                  name="pin"
                  ref={pinRef}
                  value={formData.pin}
                  onChange={handlePinChange}
                  onFocus={() => setActiveField('pin')}
                  className="input-field pl-10"
                  placeholder="Enter your PIN"
                  maxLength="4"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="done"
                  style={{ WebkitTextSecurity: 'disc' }}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
              </div>
              {errors.pin && (
                <p className="mt-1 text-sm text-red-600">{errors.pin}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !formData.username || !formData.pin}
              className="w-full btn-primary flex items-center justify-center space-x-2 py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <ButtonSpinner />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Login</span>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  };

  // Waiter Username + PIN Login Component
  const renderWaiterUsernamePinLoginScreen = () => (
    <div className="space-y-8">
      <div className="text-center">
        <button
          onClick={() => setLoginPhase('user-selection')}
          className="flex items-center space-x-2 text-primary-600 hover:text-primary-700 transition-colors mb-4 mx-auto"
        >
          <FiArrowLeft className="w-4 h-4" />
          <span>Back to waiter selection</span>
        </button>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Waiter Login
        </h2>
        <p className="text-gray-600">
          Enter username and 4-digit PIN
        </p>
      </div>

      <div className="bg-white shadow-soft rounded-2xl p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              Username or Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiUser className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="username"
                name="username"
                type="text"
                ref={adminUsernameRef}
                value={formData.username}
                onChange={handleChange}
                onFocus={() => setActiveField('admin_username')}
                className={`input-field pl-10 ${errors.username ? 'border-red-500 focus:ring-red-500' : ''}`}
                placeholder="Enter username or full name"
                disabled={isLoading}
              />
            </div>
            {errors.username && (
              <p className="mt-1 text-sm text-red-600">{errors.username}</p>
            )}
          </div>

          <div>
            <div className="flex justify-center mb-4">
              <div className="flex space-x-3">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className={`w-12 h-12 border-2 rounded-lg flex items-center justify-center text-2xl font-bold ${
                      formData.pin.length > index
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-300 bg-gray-50'
                    }`}
                  >
                    {formData.pin.length > index ? '●' : ''}
                  </div>
                ))}
              </div>
            </div>
            {errors.pin && (
              <p className="mt-1 text-sm text-red-600 text-center">{errors.pin}</p>
            )}
          </div>

          <div className="py-4">
            <NumberKeypad />
          </div>

          <button
            type="submit"
            disabled={isLoading || !formData.username.trim() || formData.pin.length !== 4}
            className="w-full btn-primary flex items-center justify-center space-x-2 py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <ButtonSpinner />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Login</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );

  // Admin Login Component
  const renderAdminLoginScreen = () => (
    <div className="space-y-8">
      <div className="text-center">
        <button
          onClick={() => setLoginPhase('user-selection')}
          className="flex items-center space-x-2 text-primary-600 hover:text-primary-700 transition-colors mb-4 mx-auto"
        >
          <FiArrowLeft className="w-4 h-4" />
          <span>Back to waiter selection</span>
        </button>
        
        <div className="flex justify-center items-center space-x-2 mb-4">
          <img
            src="/assets/logo.png"
            alt="Logo"
            className="w-20 h-20 object-contain"
          />
          <div className="text-center">
            <a
              href="https://syntaxsoftwaresolution.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold tracking-wide bg-gradient-to-r from-primary-600 via-purple-600 to-secondary-600 bg-clip-text text-transparent"
            >
              developed by syntax software solution
            </a>
          </div>
        </div>
        <BranchBadge className="mb-2" />
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Login
        </h2>
        <p className="text-gray-600">
          Enter your credentials to continue
        </p>
      </div>

      <div className="bg-white shadow-soft rounded-2xl p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Username Field */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              Username or Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiUser className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="username"
                name="username"
                type="text"
                value={formData.username}
                onChange={handleChange}
                className={`input-field pl-10 ${errors.username ? 'border-red-500 focus:ring-red-500' : ''}`}
                placeholder="Enter username or full name"
                disabled={isLoading}
              />
            </div>
            {errors.username && (
              <p className="mt-1 text-sm text-red-600">{errors.username}</p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiLock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                ref={adminPasswordRef}
                value={formData.password}
                onChange={handleChange}
                onFocus={() => setActiveField('admin_password')}
                className={`input-field pl-10 pr-10 ${errors.password ? 'border-red-500 focus:ring-red-500' : ''}`}
                placeholder="Enter your password"
                disabled={isLoading}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
              >
                {showPassword ? (
                  <FiEyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                ) : (
                  <FiEye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !formData.username.trim() || !formData.password}
            className="w-full btn-primary flex items-center justify-center space-x-2 py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <ButtonSpinner />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        {SHOW_DEMO_ACCOUNTS && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center mb-4">
              Demo Accounts
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setFormData(prev => ({ ...prev, username: 'admin', password: 'admin123' }));
                }}
                disabled={isLoading}
                className="w-full text-xs bg-purple-100 text-purple-700 px-3 py-2 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50"
              >
                Admin (admin / admin123)
              </button>
              <button
                onClick={() => {
                  setFormData(prev => ({ ...prev, username: 'Sarah Baker', password: 'baker123' }));
                }}
                disabled={isLoading}
                className="w-full text-xs bg-orange-100 text-orange-700 px-3 py-2 rounded-lg hover:bg-orange-200 transition-colors disabled:opacity-50"
              >
                Sarah Baker (baker123)
              </button>
              <button
                onClick={() => {
                  setFormData(prev => ({ ...prev, username: 'Lisa Cashier', password: 'cashier123' }));
                }}
                disabled={isLoading}
                className="w-full text-xs bg-green-100 text-green-700 px-3 py-2 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50"
              >
                Lisa Cashier (cashier123)
              </button>
              <button
                onClick={() => {
                  setFormData(prev => ({ ...prev, username: 'Tom Kitchen', password: 'kitchen123' }));
                }}
                disabled={isLoading}
                className="w-full text-xs bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
              >
                Tom Kitchen (kitchen123)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {loginPhase === 'user-selection' && renderUserSelectionScreen()}
        {loginPhase === 'pin-entry' && renderPinEntryScreen()}
        {loginPhase === 'admin' && renderAdminLoginScreen()}
        {loginPhase === 'waiter-username-pin' && renderWaiterUsernamePinLoginScreen()}

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 mt-8">
          <div className="flex justify-center">
            <img
              src="/assets/logo.png"
              alt="Logo"
              className="w-10 h-10 object-contain"
            />
          </div>
          <div className="mt-2">
            <a
              href="https://syntaxsoftwaresolution.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold tracking-wide bg-gradient-to-r from-primary-600 via-purple-600 to-secondary-600 bg-clip-text text-transparent"
            >
              developed by syntax software solution
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
