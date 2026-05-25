import React from 'react';

/**
 * Loading Spinner Component
 * Displays a centered loading spinner with optional text
 */
const LoadingSpinner = ({ 
  size = 'medium', 
  text = 'Loading...', 
  showText = true,
  className = '' 
}) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12',
    xlarge: 'w-16 h-16'
  };

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen bg-gray-50 ${className}`}>
      <div className="flex flex-col items-center space-y-4">
        {/* Spinner */}
        <div className={`${sizeClasses[size]} border-4 border-gray-200 border-t-primary-500 rounded-full animate-spin`}></div>
        
        {/* Loading text */}
        {showText && (
          <p className="text-gray-600 font-medium animate-pulse">
            {text}
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * Inline Loading Spinner
 * Smaller spinner for inline use
 */
export const InlineSpinner = ({ size = 'small', className = '' }) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-6 h-6',
  };

  return (
    <div className={`${sizeClasses[size]} border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin ${className}`}></div>
  );
};

/**
 * Button Loading Spinner
 * Spinner specifically designed for buttons
 */
export const ButtonSpinner = ({ className = '' }) => {
  return (
    <div className={`w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin ${className}`}></div>
  );
};

export default LoadingSpinner;
