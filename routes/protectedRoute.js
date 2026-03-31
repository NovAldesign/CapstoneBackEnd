import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('gfc_token');
  const user  = JSON.parse(localStorage.getItem('gfc_user') || '{}');

  if (!token || user?.role !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;