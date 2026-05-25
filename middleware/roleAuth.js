// Role-based authorization middleware
// Since we're not using JWT, this is a simple role check based on user_id in request

const User = require('../models/User');

const roleAuth = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      // Get user_id from request body, params, or query
      const userId = req.body.user_id || req.params.userId || req.query.user_id;
      
      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'User ID is required for authorization'
        });
      }

      // Get user from database
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'User not found'
        });
      }

      if (!user.is_active) {
        return res.status(401).json({
          status: 'error',
          message: 'User account is deactivated'
        });
      }

      // Check if user role is allowed
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          status: 'error',
          message: 'Insufficient permissions'
        });
      }

      // Add user to request object for use in controllers
      req.user = user;
      next();

    } catch (error) {
      console.error('Role authorization error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Authorization failed'
      });
    }
  };
};

// Predefined role middleware
const adminOnly = roleAuth(['admin']);
const bakeryEmployee = roleAuth(['admin', 'bakery_employee']);
const cafeWaiter = roleAuth(['admin', 'cafe_waiter']);
const cashier = roleAuth(['admin', 'cashier']);
const kitchenStaff = roleAuth(['admin', 'kitchen_staff']);
const allStaff = roleAuth(['admin', 'bakery_employee', 'cafe_waiter', 'cashier', 'kitchen_staff']);

module.exports = {
  roleAuth,
  adminOnly,
  bakeryEmployee,
  cafeWaiter,
  cashier,
  kitchenStaff,
  allStaff
};
