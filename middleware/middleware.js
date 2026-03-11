export const logReq = (req, res, next) => {
  console.log(`${req.method} -- ${req.url} -- ${new Date().toLocaleTimeString()}`);
  next();
};

export const globalErr = (err, req, res, next) => {
  console.error("GFC System Error:", err.stack);
  const statusCode = err.name === "ValidationError" ? 400 : (err.status || 500);
  res.status(statusCode).json({
    error: `❌ ${err.name || 'Error'}: ${err.message}`
  });
};