import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import useAuth from './hooks/useAuth';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

// Role-based route wrapper
const RoleRoute = ({ children, roles }) => {
  const { currentUser } = useAuth();
  if (!roles.includes(currentUser?.role)) return <Navigate to="/dashboard" replace />;
  return children;
};

const App = () => {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />

        {/* Admin only routes */}
        <Route path="/admin/users" element={
          <ProtectedRoute>
            <RoleRoute roles={['admin']}>
              <div>Admin Users Page</div>
            </RoleRoute>
          </ProtectedRoute>
        } />

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
};

export default App;