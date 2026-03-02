export const logReq = (req, _res, next) => {
  console.log(
    `${req.method} -- ${req.url} -- ${new Date().toLocaleDateString()}`,
  );

  next();
}

export const globalErr = (err, _req, res, _next) => {

 const statusCode = err.name === "ValidationError" ? 400 : (err.status || 500);
  
  res.status(statusCode).json({ 
    error: `❌ ${err.name || 'Error'}: ${err.message}` 
  });
}