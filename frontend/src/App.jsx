import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import useAuth from './hooks/useAuth';
import Layout from './components/Layout';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import MyShifts from './pages/MyShifts';
import NotFound from './pages/NotFound';
import Availability from './pages/Availability';
import Swaps from './pages/Swaps';
import Leave from './pages/Leave';
import Team from './pages/Team';
import Reports from './pages/Reports';

const ProtectedRoute = ({ children }) => {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
};

const RoleRoute = ({ children, roles }) => {
  const { currentUser } = useAuth();
  if (!roles.includes(currentUser?.role)) return <Navigate to="/dashboard" replace />;
  return children;
};

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        
        <Route path='/schedule' element ={
          <ProtectedRoute>
            <Schedule />
          </ProtectedRoute>
        } />

        <Route path="/my-shifts" element={
          <ProtectedRoute>
            <MyShifts />
          </ProtectedRoute>
        } />

        <Route path="/availability" element={
          <ProtectedRoute>
            <Availability />
          </ProtectedRoute>
        } />

        <Route path="/swaps" element={
          <ProtectedRoute>
            <Swaps />
          </ProtectedRoute>
        } />

        <Route path="/leave" element={
          <ProtectedRoute>
            <Leave />
          </ProtectedRoute>
        } />

        <Route path="/team" element={
          <ProtectedRoute>
            <RoleRoute roles={['admin', 'lead']}>
              <Team />
            </RoleRoute>
          </ProtectedRoute>
        } />

        <Route path="/reports" element={
          <ProtectedRoute>
            <RoleRoute roles={['admin', 'lead']}>
              <Reports />
            </RoleRoute>
          </ProtectedRoute>
        } />

        <Route path="/admin/users" element={
          <ProtectedRoute>
            <RoleRoute roles={['admin']}>
              <div>Admin Users Page</div>
            </RoleRoute>
          </ProtectedRoute>
        } />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={
          <ProtectedRoute>
            <NotFound />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
};

export default App;