import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LuLayoutDashboard,
  LuCalendarDays,
  LuCalendarCheck,
  LuClipboardList,
  LuArrowLeftRight,
  LuFileText,
  LuUsers,
  LuBuilding2,
  LuTrendingUp,
  LuSun,
  LuMoon,
  LuLogOut,
  LuChevronLeft,
  LuChevronRight,
} from 'react-icons/lu';
import useAuth from '../hooks/useAuth';
import useTheme from '../hooks/useTheme';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LuLayoutDashboard },
  { to: '/schedule', label: 'Schedule', icon: LuCalendarDays },
  { to: '/my-shifts', label: 'My Shifts', icon: LuCalendarCheck },
  { to: '/availability', label: 'Availability', icon: LuClipboardList },
  { to: '/swaps', label: 'Swap Requests', icon: LuArrowLeftRight },
  { to: '/leave', label: 'Leave Requests', icon: LuFileText },
];

const leadAdminItems = [
  { to: '/team', label: 'Team', icon: LuUsers },
  { to: '/reports', label: 'Reports', icon: LuTrendingUp },
];

const adminItems = [
  { to: '/admin/users', label: 'Users', icon: LuUsers },
  { to: '/admin/departments', label: 'Departments', icon: LuBuilding2 },
];

const Layout = ({ children }) => {
  const { currentUser, logout, isAdmin, isLead } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className={`layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">

        <div className="sidebar-header">
          {!collapsed && <h1 className="logo">ShiftWise</h1>}
          <button className="collapse-btn" onClick={() => setCollapsed(prev => !prev)}>
            {collapsed ? <LuChevronRight size={18} /> : <LuChevronLeft size={18} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className="nav-icon" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}

          {(isAdmin || isLead) && (
            <div className="nav-section">
              {!collapsed && <span className="nav-section-label">Management</span>}
              {leadAdminItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  title={collapsed ? label : undefined}
                >
                  <Icon size={18} className="nav-icon" />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              ))}
            </div>
          )}

          {isAdmin && (
            <div className="nav-section">
              {!collapsed && <span className="nav-section-label">Admin</span>}
              {adminItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  title={collapsed ? label : undefined}
                >
                  <Icon size={18} className="nav-icon" />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme} title={isDark ? 'Light mode' : 'Dark mode'}>
          {isDark 
              ? <LuSun size={18} className="sun-icon" /> 
              : <LuMoon size={18} className="moon-icon" />
          }
          {!collapsed && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
          </button>

          {!collapsed && (
            <div className="user-info">
              <span className="user-name">{currentUser?.name}</span>
              <span className="user-role">{currentUser?.role}</span>
            </div>
          )}

          <button className="logout-btn" onClick={handleLogout} title="Sign out">
            <LuLogOut size={18} />
            {!collapsed && <span>Sign out</span>}
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