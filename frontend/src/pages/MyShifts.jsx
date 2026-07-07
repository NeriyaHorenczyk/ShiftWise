import { useState, useEffect } from 'react';
import { api } from '../services/api';
import useAuth from '../hooks/useAuth';
import {
  getWeekStart,
  getWeekDays,
  toDateString,
  formatDay,
  formatTime,
  formatWeekRange,
  isToday,
} from '../utils/dateUtils';
import {
  LuChevronLeft,
  LuChevronRight,
  LuArrowLeftRight,
} from 'react-icons/lu';

const MyShifts = () => {
  const { currentUser } = useAuth();
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const weekDays = getWeekDays(weekStart);

  useEffect(() => {
    const loadShifts = async () => {
      setLoading(true);
      try {
        const data = await api.getMyShifts({
          week_start: toDateString(weekStart),
        });
        setShifts(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadShifts();
  }, [weekStart]);

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const goToToday = () => setWeekStart(getWeekStart());

  const getShiftsForDay = (day) => {
    return shifts.filter(shift => {
      const shiftDate = new Date(shift.start_time);
      return shiftDate.toDateString() === day.toDateString();
    });
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>My Shifts</h2>
        <p className="page-subtitle">{formatWeekRange(weekStart)}</p>
      </div>

      <div className="schedule-controls">
        <div className="week-nav">
          <button className="btn btn-secondary icon-btn" onClick={prevWeek}>
            <LuChevronLeft size={16} />
          </button>
          <button className="btn btn-secondary" onClick={goToToday}>
            Today
          </button>
          <button className="btn btn-secondary icon-btn" onClick={nextWeek}>
            <LuChevronRight size={16} />
          </button>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Loading shifts...</div>
      ) : (
        <div className="schedule-grid">
          {weekDays.map((day, i) => {
            const dayShifts = getShiftsForDay(day);
            return (
              <div
                key={i}
                className={`schedule-day ${isToday(day) ? 'today' : ''}`}
              >
                <div className="schedule-day-header">
                  <span className="day-name">{formatDay(day)}</span>
                </div>

                <div className="schedule-day-shifts">
                  {dayShifts.length === 0 ? (
                    <div className="no-shifts">No shifts</div>
                  ) : (
                    dayShifts.map(shift => (
                      <MyShiftCard
                        key={shift.id}
                        shift={shift}
                        currentUser={currentUser}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MyShiftCard = ({ shift, currentUser }) => {
  const [showSwapForm, setShowSwapForm] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [targetUsername, setTargetUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleOpenSwap = async () => {
    if (!showSwapForm) {
      try {
        const users = await api.getUsers();
        const colleagues = users.filter(u => u.username !== currentUser.username);
        // SM-flagged shifts can only swap with other shift_managers
        setTeamMembers(
          shift.is_shift_manager === 1
            ? colleagues.filter(u => u.role === 'shift_manager')
            : colleagues
        );
      } catch (err) {
        setError(err.message);
      }
    }
    setShowSwapForm(prev => !prev);
  };

  const handleSwapRequest = async () => {
    if (!targetUsername) return;
    setLoading(true);
    setError('');
    try {
      await api.createSwap({ shift_id: shift.id, target_username: targetUsername });
      setSuccess('Swap request sent successfully.');
      setShowSwapForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`shift-card shift-${shift.status}`}>
      <div className="shift-card-title">
        {shift.title}
        {shift.is_shift_manager === 1 && (
          <span className="sm-badge" style={{ marginLeft: '0.375rem' }}>SM</span>
        )}
      </div>
      <div className="shift-card-time">
        {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
      </div>
      <div className="shift-card-meta">
        <span className="list-item-sub">{shift.department_name}</span>
      </div>

      {/* Swap request */}
      <button
        className="swap-btn"
        onClick={handleOpenSwap}
        title="Request swap"
      >
        <LuArrowLeftRight size={13} />
        <span>Request swap</span>
      </button>

      {showSwapForm && (
        <div className="swap-form">
          <select
            className="dept-select"
            value={targetUsername}
            onChange={e => setTargetUsername(e.target.value)}
          >
            <option value="">Select colleague...</option>
            {teamMembers.map(u => (
              <option key={u.username} value={u.username}>{u.username}</option>
            ))}
          </select>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSwapRequest}
            disabled={!targetUsername || loading}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}

      {error && <div className="error-message" style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>{error}</div>}
      {success && <div className="success-message">{success}</div>}
    </div>
  );
};

export default MyShifts;