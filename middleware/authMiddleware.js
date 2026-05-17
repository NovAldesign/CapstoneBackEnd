import jwt from 'jsonwebtoken';

export const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Not authorized, invalid token' });
  }
};

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    // ✅ Case-insensitive comparison so 'admin' matches 'Admin'
    const userRole = req.user.role?.toLowerCase();
    const allowed  = roles.map(r => r.toLowerCase());

    if (!allowed.includes(userRole)) {
      return res.status(403).json({ error: `Access denied: insufficient permissions.` });
    }
    next();
  };
};