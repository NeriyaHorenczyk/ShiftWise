import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  CalendarCheck,
  ClipboardList,
  ArrowLeftRight,
  FileText,
  Users,
  Building2,
  TrendingUp,
  Copy,
  User,
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import useAuth from '../hooks/useAuth';
import useTheme from '../hooks/useTheme';
import ConfirmModal from './ConfirmModal';
import NotificationCenter from './NotificationCenter';
import { getAssetUrl } from '../services/api';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/my-shifts', label: 'My Shifts', icon: CalendarCheck },
  { to: '/availability', label: 'Availability', icon: ClipboardList },
  { to: '/swaps', label: 'Swap Requests', icon: ArrowLeftRight },
  { to: '/leave', label: 'Leave Requests', icon: FileText },
  { to: '/profile', label: 'Profile', icon: User },
];

const leadAdminItems = [
  { to: '/team', label: 'Team', icon: Users },
  { to: '/reports', label: 'Reports', icon: TrendingUp },
];

const leadOnlyItems = [
  { to: '/blueprint', label: 'Blueprint', icon: Copy },
];

const adminItems = [
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/departments', label: 'Departments', icon: Building2 },
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
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
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
            <LogOut size={18} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems
            .filter(({ to }) => !((isLead || isAdmin) && to === '/my-shifts'))
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

          {/* .sidebar-header/.sidebar-user/.sidebar-footer (where these two
              actions normally live) are hidden below the 768px breakpoint,
              where the sidebar becomes a bottom tab bar — without a
              mobile-only copy here, phone users would have no way to sign
              out or switch theme at all. Invisible above that breakpoint. */}
          <button type="button" className="nav-item mobile-only" onClick={toggleTheme} title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? <Sun size={18} className="nav-icon" /> : <Moon size={18} className="nav-icon" />}
            <span>{isDark ? 'Light' : 'Dark'}</span>
          </button>
          <button type="button" className="nav-item mobile-only" onClick={() => setShowLogoutModal(true)} title="Sign out">
            <LogOut size={18} className="nav-icon" />
            <span>Sign out</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme} title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark
              ? <Sun size={18} className="sun-icon" />
              : <Moon size={18} className="moon-icon" />
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