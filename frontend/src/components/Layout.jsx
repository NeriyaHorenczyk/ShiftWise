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
  LuCopy,
  LuUser,
  LuSun,
  LuMoon,
  LuLogOut,
  LuChevronLeft,
  LuChevronRight,
} from 'react-icons/lu';
import useAuth from '../hooks/useAuth';
import useTheme from '../hooks/useTheme';
import ConfirmModal from './ConfirmModal';
import NotificationCenter from './NotificationCenter';
import { getAssetUrl } from '../services/api';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LuLayoutDashboard },
  { to: '/schedule', label: 'Schedule', icon: LuCalendarDays },
  { to: '/my-shifts', label: 'My Shifts', icon: LuCalendarCheck },
  { to: '/availability', label: 'Availability', icon: LuClipboardList },
  { to: '/swaps', label: 'Swap Requests', icon: LuArrowLeftRight },
  { to: '/leave', label: 'Leave Requests', icon: LuFileText },
  { to: '/profile', label: 'Profile', icon: LuUser },
];

const leadAdminItems = [
  { to: '/team', label: 'Team', icon: LuUsers },
  { to: '/reports', label: 'Reports', icon: LuTrendingUp },
];

const leadOnlyItems = [
  { to: '/blueprint', label: 'Blueprint', icon: LuCopy },
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
  const [showLogoutModal, setShowLogoutModal] = useState(false);

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

        <div className="sidebar-user">
          <div className="user-info">
            <div className="user-avatar">
              {currentUser?.avatar_url ? (
                <img src={getAssetUrl(currentUser.avatar_url)} alt={currentUser.name} />
              ) : (
                <span>{currentUser?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</span>
              )}
            </div>
            {!collapsed && (
              <div className="user-details">
                <span className="user-name">{currentUser?.name}</span>
                <span className="user-role">{currentUser?.role}</span>
              </div>
            )}
          </div>

          <button className="logout-btn" onClick={() => setShowLogoutModal(true)} title="Sign out">
            <LuLogOut size={18} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems
            .filter(({ to }) => !(isLead && to === '/my-shifts'))
            .map(({ to, label, icon: Icon }) => (
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

          {isLead && (
            <div className="nav-section">
              {!collapsed && <span className="nav-section-label">Lead Tools</span>}
              {leadOnlyItems.map(({ to, label, icon: Icon }) => (
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
        </div>

      </aside>

      <main className="main-content">
        {children}
      </main>

      {showLogoutModal && (
        <ConfirmModal
          title="Sign out"
          message="Are you sure you want to sign out?"
          confirmLabel="Sign out"
          cancelLabel="Cancel"
          danger={true}
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}

      <NotificationCenter />
    </div>
  );
};

export default Layout;