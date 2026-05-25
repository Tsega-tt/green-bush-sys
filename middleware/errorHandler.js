const errorHandler = (err, req, res, next) => {
  console.error('Error Stack:', err.stack);

  // Default error response
  let error = {
    status: 'error',
    message: 'Internal server error',
    statusCode: 500
  };

  // Validation errors
  if (err.name === 'ValidationError') {
    error.message = 'Validation failed';
    error.statusCode = 400;
    error.details = Object.values(err.errors).map(val => val.message);
  }

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        error.message = 'Duplicate entry found';
        error.statusCode = 409;
        break;
      case '23503': // Foreign key violation
        error.message = 'Referenced record not found';
        error.statusCode = 400;
        break;
      case '23502': // Not null violation
        error.message = 'Required field is missing';
        error.statusCode = 400;
        break;
      case '42P01': // Undefined table
        error.message = 'Database table not found';
        error.statusCode = 500;
        break;
      case '42703': // Undefined column
        error.message = 'Database column not found';
        error.statusCode = 500;
        break;
      case 'ECONNREFUSED':
        error.message = 'Database connection failed';
        error.statusCode = 503;
        break;
      default:
        error.message = 'Database error occurred';
        error.statusCode = 500;
    }
  }

  // Custom application errors
  if (err.statusCode) {
    error.statusCode = err.statusCode;
    error.message = err.message;
  }

  // JWT errors (if needed in future)
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    error.statusCode = 401;
  }

  // Send error response
  res.status(error.statusCode).json({
    status: error.status,
    message: error.message,
    ...(error.details && { details: error.details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
