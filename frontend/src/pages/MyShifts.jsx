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
  LuX,
} from 'react-icons/lu';
import WeekTimeGrid from '../components/WeekTimeGrid';
import { splitIntoDaySegments, layoutColumns, eventBlockStyle } from '../utils/weekGridUtils';

// Shift managers are fair game for a regular swap — only leads/admins (actual
// department leadership) are off-limits.
const LEADERSHIP_ROLES = ['lead', 'admin'];

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

  const getSegmentsForDay = (day) => {
    const segments = [];
    shifts.forEach(shift => {
      splitIntoDaySegments(new Date(shift.start_time), new Date(shift.end_time)).forEach(seg => {
        if (seg.dayStart.toDateString() === day.toDateString()) {
          segments.push({ shift, ...seg });
        }
      });
    });
    return layoutColumns(segments);
  };

  return (
    <div className="page page-wide">
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
        <WeekTimeGrid
          weekDays={weekDays}
          isToday={isToday}
          renderDayLabel={formatDay}
          renderDay={(day) => getSegmentsForDay(day).map(seg => (
            <MyShiftCard
              key={`${seg.shift.id}-${seg.startHour}`}
              shift={seg.shift}
              currentUser={currentUser}
              style={eventBlockStyle(seg)}
            />
          ))}
        />
      )}
    </div>
  );
};

const MyShiftCard = ({ shift, currentUser, style }) => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div
        className={`tg-event clickable ${shift.status === 'published' ? 'shift-published' : 'shift-draft'}`}
        style={style}
        onClick={() => setShowModal(true)}
        title={`${shift.title} · ${formatTime(shift.start_time)} – ${formatTime(shift.end_time)}`}
      >
        <div className="tg-event-title">
          {shift.title}
          {shift.is_shift_manager === 1 && (
            <span className="sm-badge" style={{ marginLeft: '0.375rem' }}>SM</span>
          )}
        </div>
        <div className="tg-event-time">
          {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
        </div>
      </div>

      {showModal && (
        <SwapRequestModal shift={shift} currentUser={currentUser} onClose={() => setShowModal(false)} />
      )}
    </>
  );
};

const SwapRequestModal = ({ shift, currentUser, onClose }) => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [targetUsername, setTargetUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadColleagues = async () => {
      try {
        const [users, shiftDetail] = await Promise.all([
          api.getUsers(),
          api.getShiftById(shift.id),
        ]);
        const assignedUsernames = shiftDetail.assignments?.map(a => a.username) || [];
        const colleagues = users.filter(u =>
          u.username !== currentUser.username &&
          !assignedUsernames.includes(u.username)
        );
        // SM-flagged shifts can only swap with other shift_managers;
        // a regular shift can be handed to another employee or a shift manager,
        // but not to department leadership (lead/admin)
        setTeamMembers(
          shift.is_shift_manager === 1
            ? colleagues.filter(u => u.role === 'shift_manager')
            : colleagues.filter(u => !LEADERSHIP_ROLES.includes(u.role))
        );
      } catch (err) {
        setError(err.message);
      }
    };
    loadColleagues();
  }, [shift.id, shift.is_shift_manager, currentUser.username]);

  const handleSwapRequest = async () => {
    if (!targetUsername) return;
    setLoading(true);
    setError('');
    try {
      await api.createSwap({ shift_id: shift.id, target_username: targetUsername });
      setSuccess('Swap request sent successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{shift.title}</h3>
            <p className="modal-subtitle">
              {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><LuX size={18} /></button>
        </div>

        <div className="form-group">
          <label>Request swap with</label>
          <select
            className="dept-select"
            value={targetUsername}
            onChange={e => setTargetUsername(e.target.value)}
            disabled={!!success}
          >
            <option value="">Select colleague...</option>
            {teamMembers.map(u => (
              <option key={u.username} value={u.username}>{u.username}</option>
            ))}
          </select>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          {!success && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSwapRequest}
              disabled={!targetUsername || loading}
            >
              {loading ? 'Sending...' : 'Send request'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyShifts;