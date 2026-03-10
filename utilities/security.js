import rateLimit from 'express-rate-limit';

// Login Rate limiter
export const loginLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 login requests per windowMs
  message: {
    error: "Too many login attempts. Please try again after 30 minutes to protect your account."
  },
  standardHeaders: true, 
  legacyHeaders: false,
});