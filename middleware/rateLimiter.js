// Simple rate limiting middleware
const rateLimiter = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
  const requests = new Map();

  return (req, res, next) => {
    const clientId = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Clean up old entries
    for (const [key, data] of requests.entries()) {
      if (now - data.firstRequest > windowMs) {
        requests.delete(key);
      }
    }

    // Get or create client data
    if (!requests.has(clientId)) {
      requests.set(clientId, {
        count: 0,
        firstRequest: now
      });
    }

    const clientData = requests.get(clientId);
    
    // Check if window has expired
    if (now - clientData.firstRequest > windowMs) {
      clientData.count = 1;
      clientData.firstRequest = now;
      return next();
    }

    // Check if limit exceeded
    if (clientData.count >= maxRequests) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many requests, please try again later',
        retryAfter: Math.ceil((windowMs - (now - clientData.firstRequest)) / 1000)
      });
    }

    let finished = false;
    res.on('finish', () => {
      finished = true;
      clientData.count++;
    });

    res.on('close', () => {
      if (!finished) {
        // Client disconnected before response completed; don't count this request.
      }
    });

    next();
  };
};

// Predefined rate limiters
const generalLimiter = rateLimiter(15 * 60 * 1000, 100); // 100 requests per 15 minutes
const authLimiter = rateLimiter(15 * 60 * 1000, 10); // 10 auth attempts per 15 minutes
const strictLimiter = rateLimiter(15 * 60 * 1000, 50); // 50 requests per 15 minutes

module.exports = {
  rateLimiter,
  generalLimiter,
  authLimiter,
  strictLimiter
};
