import { NavLink, useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import useTheme from '../hooks/useTheme';

const Layout = ({ children }) => {
  const { currentUser, logout, isAdmin, isLead } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">ShiftWise</h1>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            Dashboard
          </NavLink>

          <NavLink to="/schedule" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            Schedule
          </NavLink>

          <NavLink to="/my-shifts" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            My Shifts
          </NavLink>

          <NavLink to="/availability" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            Availability
          </NavLink>

          <NavLink to="/swaps" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            Swap Requests
          </NavLink>

          <NavLink to="/leave" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            Leave Requests
          </NavLink>

          {(isAdmin || isLead) && (
            <NavLink to="/team" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
              Team
            </NavLink>
          )}

          {(isAdmin || isLead) && (
            <NavLink to="/reports" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
              Reports
            </NavLink>
          )}

          {isAdmin && (
            <div className="nav-section">
              <span className="nav-section-label">Admin</span>
              <NavLink to="/admin/users" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                Users
              </NavLink>
              <NavLink to="/admin/departments" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                Departments
              </NavLink>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme}>
            {isDark ? '☀️ Light mode' : '🌙 Dark mode'}
          </button>
          <div className="user-info">
            <span className="user-name">{currentUser?.name}</span>
            <span className="user-role">{currentUser?.role}</span>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default Layout;