import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { api } from '../services/api';

const Dashboard = () => {
  const { currentUser, isAdmin, isLead } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [upcomingShifts, setUpcomingShifts] = useState([]);
  const [pendingSwaps, setPendingSwaps] = useState([]);
  const [pendingLeave, setPendingLeave] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [shifts, swaps, leave] = await Promise.all([
          api.getShifts(),
          api.getSwaps(),
          api.getLeave(),
        ]);

        setUpcomingShifts(shifts.slice(0, 5));
        setPendingSwaps(swaps.filter(s => s.status === 'pending' || s.status === 'accepted'));
        setPendingLeave(leave.filter(l => l.status === 'pending'));

        if (isAdmin) {
          const users = await api.getUsers();
          const departments = await api.getDepartments();
          setStats({
            totalUsers: users.length,
            totalDepartments: departments.length,
            totalShifts: shifts.length,
            pendingRequests: swaps.filter(s => s.status === 'pending').length +
              leave.filter(l => l.status === 'pending').length,
          });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [isAdmin]);

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-IL', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Welcome back, {currentUser?.name}</h2>
        <p className="page-subtitle">
          {isAdmin ? 'System overview' : isLead ? 'Department overview' : 'Your schedule at a glance'}
        </p>
      </div>

      {/* Admin stats */}
      {isAdmin && stats && (
        <div className="stats-grid">
          <div className="stat-card" onClick={() => navigate('/admin/users')}>
            <span className="stat-value">{stats.totalUsers}</span>
            <span className="stat-label">Total users</span>
          </div>
          <div className="stat-card" onClick={() => navigate('/admin/departments')}>
            <span className="stat-value">{stats.totalDepartments}</span>
            <span className="stat-label">Departments</span>
          </div>
          <div className="stat-card" onClick={() => navigate('/schedule')}>
            <span className="stat-value">{stats.totalShifts}</span>
            <span className="stat-label">Total shifts</span>
          </div>
          <div className="stat-card" onClick={() => navigate('/swaps')}>
            <span className="stat-value">{stats.pendingRequests}</span>
            <span className="stat-label">Pending requests</span>
          </div>
        </div>
      )}

      <div className={`dashboard-grid ${isLead ? 'dashboard-grid-2' : ''}`}>
        {/* Upcoming shifts */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Upcoming shifts</h3>
            <button className="card-link" onClick={() => navigate('/schedule')}>
              View all
            </button>
          </div>
          {upcomingShifts.length === 0 ? (
            <p className="empty-state">No upcoming shifts</p>
          ) : (
            <div className="list">
              {upcomingShifts.map(shift => (
                <div key={shift.id} className="list-item">
                  <div className="list-item-main">
                    <span className="list-item-title">{shift.title}</span>
                    <span className="list-item-sub">{shift.department_name}</span>
                  </div>
                  <div className="list-item-meta">
                    <span className={`badge badge-${shift.status}`}>{shift.status}</span>
                    <span className="list-item-date">{formatDate(shift.start_time)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending swap requests */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Pending swaps</h3>
            <button className="card-link" onClick={() => navigate('/swaps')}>
              View all
            </button>
          </div>
          {pendingSwaps.length === 0 ? (
            <p className="empty-state">No pending swap requests</p>
          ) : (
            <div className="list">
              {pendingSwaps.map(swap => (
                <div key={swap.id} className="list-item">
                  <div className="list-item-main">
                    <span className="list-item-title">{swap.shift_title}</span>
                    <span className="list-item-sub">
                      {swap.requester_username} → {swap.target_username}
                    </span>
                  </div>
                  <span className={`badge badge-${swap.status}`}>{swap.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending leave requests — not relevant for a lead's own dashboard */}
        {!isLead && (
          <div className="dashboard-card">
            <div className="card-header">
              <h3>Pending leave</h3>
              <button className="card-link" onClick={() => navigate('/leave')}>
                View all
              </button>
            </div>
            {pendingLeave.length === 0 ? (
              <p className="empty-state">No pending leave requests</p>
            ) : (
              <div className="list">
                {pendingLeave.map(leave => (
                  <div key={leave.id} className="list-item">
                    <div className="list-item-main">
                      <span className="list-item-title">{leave.user_name}</span>
                      <span className="list-item-sub">
                        {new Date(leave.start_date).toLocaleDateString()} —{' '}
                        {new Date(leave.end_date).toLocaleDateString()}
                      </span>
                    </div>
                    <span className="badge badge-pending">pending</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;