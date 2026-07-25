import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { api } from '../services/api';
import { LuSearch } from 'react-icons/lu';

const Dashboard = () => {
  const { currentUser, isAdmin, isLead } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [upcomingShifts, setUpcomingShifts] = useState([]);
  const [pendingSwaps, setPendingSwaps] = useState([]);
  const [pendingLeave, setPendingLeave] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Employees filter their own upcoming shifts by title; admins/leads
  // instead filter the swap/leave cards by the employee's name — the two
  // roles never share this box, so one field covers both meanings.
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const data = await api.getDashboard();
        setUpcomingShifts(data.upcomingShifts);
        setPendingSwaps(data.pendingSwaps);
        setPendingLeave(data.pendingLeave);
        setStats(data.stats);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

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

  const q = search.trim().toLowerCase();
  const isFilteringShifts = (!isAdmin && !isLead) && !!q;
  const isFilteringSwapsAndLeave = (isAdmin || isLead) && !!q;
  const filteredUpcomingShifts = isFilteringShifts
    ? upcomingShifts.filter(shift => shift.title?.toLowerCase().includes(q))
    : upcomingShifts;
  const filteredPendingSwaps = isFilteringSwapsAndLeave
    ? pendingSwaps.filter(swap =>
        swap.requester_username?.toLowerCase().includes(q) ||
        swap.target_username?.toLowerCase().includes(q)
      )
    : pendingSwaps;
  const filteredPendingLeave = isFilteringSwapsAndLeave
    ? pendingLeave.filter(leave => leave.user_name?.toLowerCase().includes(q))
    : pendingLeave;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h2>Welcome back, {currentUser?.name}</h2>
            <p className="page-subtitle">
              {isAdmin ? 'System overview' : isLead ? 'Department overview' : 'Your schedule at a glance'}
            </p>
          </div>

          <div className="search-wrap">
            <LuSearch className="search-icon" size={16} />
            <input
              type="text"
              className="search-input"
              placeholder={(isAdmin || isLead) ? 'Filter by employee name...' : 'Filter by shift name...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
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

      <div className="dashboard-grid">
        {/* Upcoming shifts */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Upcoming shifts</h3>
            <button className="card-link" onClick={() => navigate('/schedule')}>
              View all
            </button>
          </div>
          {filteredUpcomingShifts.length === 0 ? (
            <p className="empty-state">
              {isFilteringShifts ? 'No shifts match your search' : 'No upcoming shifts'}
            </p>
          ) : (
            <div className="list">
              {filteredUpcomingShifts.map(shift => (
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
          {filteredPendingSwaps.length === 0 ? (
            <p className="empty-state">
              {isFilteringSwapsAndLeave ? 'No swaps match your search' : 'No pending swap requests'}
            </p>
          ) : (
            <div className="list">
              {filteredPendingSwaps.map(swap => (
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

        {/* Pending leave requests — scoped server-side to the viewer's own
            department for a lead, or their own requests for an employee */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Pending leave</h3>
            <button className="card-link" onClick={() => navigate('/leave')}>
              View all
            </button>
          </div>
          {filteredPendingLeave.length === 0 ? (
            <p className="empty-state">
              {isFilteringSwapsAndLeave ? 'No leave requests match your search' : 'No pending leave requests'}
            </p>
          ) : (
            <div className="list">
              {filteredPendingLeave.map(leave => (
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
      </div>
    </div>
  );
};

export default Dashboard;