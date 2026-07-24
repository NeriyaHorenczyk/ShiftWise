import { useState, useEffect } from 'react';
import { api } from '../services/api';
import useAuth from '../hooks/useAuth';
import useSocket from '../hooks/useSocket';
import {
  getWeekStart,
  getWeekDays,
  toDateString,
  formatDay,
  formatTime,
  formatWeekRange,
  isToday,
  getMonthStart,
  addMonths,
  getMonthGridWeeks,
  formatMonthLabel,
} from '../utils/dateUtils';
import { LuX } from 'react-icons/lu';
import WeekTimeGrid from '../components/WeekTimeGrid';
import MonthGrid from '../components/MonthGrid';
import CalendarNav from '../components/CalendarNav';
import {
  splitIntoDaySegments,
  layoutColumns,
  eventBlockStyle,
  SHIFT_EVENT_MIN_HEIGHT,
  SHIFT_EVENT_MIN_DURATION_HOURS,
} from '../utils/weekGridUtils';

// Shift managers are fair game for a regular swap — only leads/admins (actual
// department leadership) are off-limits.
const LEADERSHIP_ROLES = ['lead', 'admin'];

const MyShifts = () => {
  const { currentUser } = useAuth();
  const { socket } = useSocket();
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  // A single anchor date drives both views, so switching between Week and
  // Month never resets the currently-selected date/time window — each view
  // just derives its own window (week/month) from wherever the anchor is.
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const weekStart = getWeekStart(anchorDate);
  const monthStart = getMonthStart(anchorDate);
  const weekDays = getWeekDays(weekStart);
  const monthWeeks = getMonthGridWeeks(monthStart);

  // Fetches shifts for whatever window the current view actually displays —
  // shared by the initial/view-change load below and the live socket refetch.
  const fetchMyShiftsForCurrentView = () => {
    if (viewMode === 'month') {
      const weeks = getMonthGridWeeks(getMonthStart(anchorDate));
      return api.getMyShifts({
        start_date: toDateString(weeks[0][0]),
        end_date: toDateString(weeks[weeks.length - 1][6]),
      });
    }
    return api.getMyShifts({ week_start: toDateString(getWeekStart(anchorDate)) });
  };

  useEffect(() => {
    const loadShifts = async () => {
      setLoading(true);
      try {
        setShifts(await fetchMyShiftsForCurrentView());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadShifts();
    // anchorDate.getTime() (a primitive) is the real dependency here — the
    // weekStart/monthStart derived above get fresh Date identities every
    // render and must not be listed instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, anchorDate.getTime()]);

  // Live collaborative sync: a lead publishing/editing/auto-assigning shifts
  // in this employee's department (see socketService.js emitScheduleUpdated
  // call sites) refetches "my shifts" automatically, same as Schedule.jsx
  // does for the lead's own view. The department_id check is defense in
  // depth — the server only ever emits to this department's room in the
  // first place — so a stray event for a different department is a no-op.
  useEffect(() => {
    if (!socket || !currentUser?.department_id) return;

    const handleScheduleUpdated = (payload) => {
      if (payload.department_id !== currentUser.department_id) return;
      fetchMyShiftsForCurrentView().then(setShifts).catch(err => setError(err.message));
    };

    socket.on('schedule:updated', handleScheduleUpdated);
    return () => socket.off('schedule:updated', handleScheduleUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, currentUser?.department_id, viewMode, anchorDate.getTime()]);

  const prevWeek = () => setAnchorDate(d => {
    const n = new Date(d);
    n.setDate(n.getDate() - 7);
    return n;
  });

  const nextWeek = () => setAnchorDate(d => {
    const n = new Date(d);
    n.setDate(n.getDate() + 7);
    return n;
  });

  const prevMonth = () => setAnchorDate(d => addMonths(d, -1));
  const nextMonth = () => setAnchorDate(d => addMonths(d, 1));

  const goToToday = () => setAnchorDate(new Date());

  const getSegmentsForDay = (day) => {
    const segments = [];
    shifts.forEach(shift => {
      splitIntoDaySegments(new Date(shift.start_time), new Date(shift.end_time)).forEach(seg => {
        if (seg.dayStart.toDateString() === day.toDateString()) {
          segments.push({ shift, ...seg });
        }
      });
    });
    return layoutColumns(segments, SHIFT_EVENT_MIN_DURATION_HOURS);
  };

  const getShiftsForDay = (day) => {
    return shifts.filter(shift => new Date(shift.start_time).toDateString() === day.toDateString());
  };

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h2>My Shifts</h2>
        <p className="page-subtitle">
          {viewMode === 'month' ? formatMonthLabel(monthStart) : formatWeekRange(weekStart)}
        </p>
      </div>

      <div className="schedule-controls">
        <CalendarNav
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onPrevMonth={prevMonth}
          onPrevWeek={prevWeek}
          onToday={goToToday}
          onNextWeek={nextWeek}
          onNextMonth={nextMonth}
        />
      </div>

      {error && <div className="page-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Loading shifts...</div>
      ) : viewMode === 'month' ? (
        <MonthGrid
          monthStart={monthStart}
          weeks={monthWeeks}
          isToday={isToday}
          renderDay={(day) => getShiftsForDay(day).map(shift => (
            <MonthShiftPill key={shift.id} shift={shift} currentUser={currentUser} />
          ))}
        />
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
              style={eventBlockStyle(seg, SHIFT_EVENT_MIN_HEIGHT)}
            />
          ))}
        />
      )}
    </div>
  );
};

// Compact, hour-less shift entry for a month-view day cell — just enough
// to see what's scheduled that day; opens the same swap-request modal.
const MonthShiftPill = ({ shift, currentUser }) => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div
        className={`month-shift-pill clickable ${shift.status === 'published' ? 'shift-published' : 'shift-draft'}`}
        onClick={() => setShowModal(true)}
        title={`${shift.title} · ${formatTime(shift.start_time)} – ${formatTime(shift.end_time)}`}
      >
        <span className="month-shift-pill-title">{shift.title}</span>
        {shift.is_shift_manager === 1 && <span className="sm-badge">SM</span>}
        <span className={`badge badge-${shift.status}`}>{shift.status}</span>
      </div>

      {showModal && (
        <SwapRequestModal shift={shift} currentUser={currentUser} onClose={() => setShowModal(false)} />
      )}
    </>
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
        <div className="tg-event-meta">
          <span className={`badge badge-${shift.status}`}>{shift.status}</span>
        </div>
      </div>

      {showModal && (
        <SwapRequestModal shift={shift} currentUser={currentUser} onClose={() => setShowModal(false)} />
      )}
    </>
  );
};

const SWAP_MESSAGE_MAX_LENGTH = 500;

const SwapRequestModal = ({ shift, currentUser, onClose }) => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [targetUsername, setTargetUsername] = useState('');
  const [message, setMessage] = useState('');
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
      await api.createSwap({
        shift_id: shift.id,
        target_username: targetUsername,
        message: message.trim() || undefined,
      });
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

        <div className="form-group">
          <label>Message to colleague (optional)</label>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder="e.g. I have a doctor's appointment that day — happy to explain more if needed."
            value={message}
            onChange={e => setMessage(e.target.value)}
            disabled={!!success}
            maxLength={SWAP_MESSAGE_MAX_LENGTH}
          />
          <p className="input-hint">{message.length}/{SWAP_MESSAGE_MAX_LENGTH}</p>
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