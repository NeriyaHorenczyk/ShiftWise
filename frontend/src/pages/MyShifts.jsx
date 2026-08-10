import { useState, useEffect, useCallback, useRef } from 'react';
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
import { X, LoaderCircle } from 'lucide-react';
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

  // Page-level toast for swap-request outcomes the modal itself can't stay
  // open to explain (a 409 conflict transitions the modal straight to its
  // "already pending" view — see SwapRequestModal — so this is what tells
  // the user *why* their click didn't do what they expected).
  const [toast, setToast] = useState(null); // { type, title, message } | null
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Single source of truth for "this shift now has a pending swap request",
  // updated locally the instant we know it's true — whether because our own
  // request just succeeded, or because a 409 just told us one already
  // existed — rather than waiting on a live-sync refetch. Every card
  // reading shift.has_pending_swap (badge, and the modal's own guard
  // against reopening a duplicate form) reflects this immediately.
  const markShiftPending = (shiftId) => {
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, has_pending_swap: true } : s));
  };

  const handleSwapCreated = (shiftId) => {
    markShiftPending(shiftId);
    setToast({
      type: 'success',
      title: 'Swap request sent',
      message: 'Swap request sent successfully!',
    });
  };

  const handleSwapConflict = (shiftId) => {
    markShiftPending(shiftId);
    setToast({
      type: 'warning',
      title: 'Swap request already pending',
      message: 'A swap request is already pending for this shift.',
    });
  };

  // The swap-request modal's colleague list — not fetched at page mount (My
  // Shifts itself never needs it), only the first time a swap modal is
  // actually opened, then cached here for every subsequent open this
  // session. null means "not fetched yet", as opposed to [] (fetched, empty).
  const [allUsers, setAllUsers] = useState(null);
  const ensureUsers = useCallback(() => {
    if (allUsers) return Promise.resolve(allUsers);
    return api.getUsers().then(users => {
      setAllUsers(users);
      return users;
    });
  }, [allUsers]);

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

      {toast && (
        <div className="toast-stack">
          <div className={`toast toast-${toast.type}`}>
            <div className="toast-body">
              <span className="toast-title">{toast.title}</span>
              {toast.message && <span className="toast-message">{toast.message}</span>}
            </div>
            <button className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="page-loading">Loading shifts...</div>
      ) : viewMode === 'month' ? (
        <MonthGrid
          monthStart={monthStart}
          weeks={monthWeeks}
          isToday={isToday}
          selectedWeekStart={weekStart}
          renderDay={(day) => getShiftsForDay(day).map(shift => (
            <MonthShiftPill
              key={shift.id}
              shift={shift}
              currentUser={currentUser}
              ensureUsers={ensureUsers}
              onSwapCreated={handleSwapCreated}
              onSwapConflict={handleSwapConflict}
            />
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
              ensureUsers={ensureUsers}
              onSwapCreated={handleSwapCreated}
              onSwapConflict={handleSwapConflict}
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
const MonthShiftPill = ({ shift, currentUser, ensureUsers, onSwapCreated, onSwapConflict }) => {
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
        {shift.has_pending_swap && <span className="badge badge-pending">Swap Pending</span>}
        <span className={`badge badge-${shift.status}`}>{shift.status}</span>
      </div>

      {showModal && (
        <SwapRequestModal
          shift={shift}
          currentUser={currentUser}
          ensureUsers={ensureUsers}
          onSwapCreated={onSwapCreated}
          onSwapConflict={onSwapConflict}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

const MyShiftCard = ({ shift, currentUser, ensureUsers, onSwapCreated, onSwapConflict, style }) => {
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
          {shift.has_pending_swap && <span className="badge badge-pending">Swap Pending</span>}
          <span className={`badge badge-${shift.status}`}>{shift.status}</span>
        </div>
      </div>

      {showModal && (
        <SwapRequestModal
          shift={shift}
          currentUser={currentUser}
          ensureUsers={ensureUsers}
          onSwapCreated={onSwapCreated}
          onSwapConflict={onSwapConflict}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

const SWAP_MESSAGE_MAX_LENGTH = 500;

const SwapRequestModal = ({ shift, currentUser, ensureUsers, onSwapCreated, onSwapConflict, onClose }) => {
  const [teamMembers, setTeamMembers] = useState([]);
  // Only ever read by the form branch below, which isn't reached at all
  // when shift.has_pending_swap is true — its initial value doesn't matter
  // for that case.
  const [colleaguesLoading, setColleaguesLoading] = useState(true);
  const [targetUsername, setTargetUsername] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Guards against a genuinely rapid double-click submitting twice — a ref
  // rather than the `loading` state because it must be readable/settable
  // synchronously, before React has had a chance to re-render and disable
  // the button (state updates are batched/deferred; this isn't).
  const submittingRef = useRef(false);

  // No GET /shifts/:id here — `shift` is the exact object from MyShifts'
  // own already-fetched list, and getMyShifts now returns each shift's
  // assigned_usernames and has_pending_swap alongside it for exactly this
  // purpose. The only thing this modal still needs to ask for is the user
  // directory, and ensureUsers() (owned by the MyShifts parent) only hits
  // the network the first time any swap modal is opened this session —
  // every open after that resolves from its cache with zero requests. If a
  // swap is already pending for this shift there's nothing to submit, so
  // this skips fetching colleagues entirely too.
  useEffect(() => {
    // Nothing to load — the "already pending" view below doesn't use
    // teamMembers/colleaguesLoading at all.
    if (shift.has_pending_swap) return;
    let cancelled = false;
    const loadColleagues = async () => {
      setColleaguesLoading(true);
      setError('');
      try {
        const users = await ensureUsers();
        if (cancelled) return;
        const assignedUsernames = shift.assigned_usernames || [];
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
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setColleaguesLoading(false);
      }
    };
    loadColleagues();
    return () => { cancelled = true; };
  }, [shift, currentUser.username, ensureUsers]);

  const handleSwapRequest = async () => {
    if (!targetUsername || submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError('');
    try {
      await api.createSwap({
        shift_id: shift.id,
        target_username: targetUsername,
        message: message.trim() || undefined,
      });
      // A successful request needs nothing more from this modal — sync the
      // parent's copy of this shift (badge) and its success toast, then
      // close immediately. A completed action should read as "done" right
      // away rather than lingering on a form that already served its
      // purpose; no local state reset needed below since the component is
      // unmounting via onClose().
      onSwapCreated(shift.id);
      onClose();
    } catch (err) {
      submittingRef.current = false;
      setLoading(false);
      if (err.status === 409) {
        // Someone (another tab, a prior click that actually landed) beat
        // this one to it — sync local/parent state to match reality and let
        // the page-level toast explain it, rather than showing a form error
        // for a request that isn't actually broken, just redundant. `shift`
        // flipping to has_pending_swap === true on the next render (once
        // onSwapConflict updates the parent) is what carries this modal
        // over to the "already pending" view below — this is the ONE case
        // that keeps the modal open instead of closing it.
        onSwapConflict(shift.id);
      } else {
        setError(err.message);
      }
    }
  };

  if (shift.has_pending_swap) {
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
            <button className="modal-close" onClick={onClose}><X size={18} /></button>
          </div>

          <div className="warning-message">
            A swap request is already pending for this shift. You can view or withdraw it from Swap Requests.
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

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
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="form-group">
          <label>Request swap with</label>
          <select
            className="dept-select"
            value={targetUsername}
            onChange={e => setTargetUsername(e.target.value)}
            disabled={colleaguesLoading || loading}
          >
            <option value="">{colleaguesLoading ? 'Loading colleagues…' : 'Select colleague...'}</option>
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
            disabled={loading}
            maxLength={SWAP_MESSAGE_MAX_LENGTH}
          />
          <p className="input-hint">{message.length}/{SWAP_MESSAGE_MAX_LENGTH}</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSwapRequest}
            disabled={!targetUsername || loading || colleaguesLoading}
          >
            {loading ? <><LoaderCircle size={14} className="spin" /> Sending...</> : 'Send request'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MyShifts;