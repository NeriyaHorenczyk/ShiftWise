import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import {
  getWeekStart,
  getWeekDays,
  toDateString,
  formatDay,
  formatWeekRange,
  isToday,
  addMonths,
} from '../utils/dateUtils';
import { eventBlockStyle, getOverlappingSlotKeys } from '../utils/weekGridUtils';
import { LuChevronLeft, LuChevronRight, LuChevronsLeft, LuChevronsRight, LuSearch, LuLock } from 'react-icons/lu';
import useAuth from '../hooks/useAuth';
import useSocket from '../hooks/useSocket';
import WeekTimeGrid from '../components/WeekTimeGrid';
import Pagination from '../components/Pagination';

const SLOTS = ['morning', 'afternoon', 'evening'];
const SLOT_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };

// Hour ranges must match getSlot() in shiftController.js so the availability
// grid lines up with how auto-assign actually interprets each slot.
// Evening (20:00–06:00) wraps past midnight, so it renders as two segments.
const SLOT_HOURS = {
  morning: [[6, 13]],
  afternoon: [[13, 20]],
  evening: [[20, 24], [0, 6]],
};

// cycle: available (default) → preferred → unavailable → available (default)
const cycleStatus = (current) => {
  if (!current || current === 'available') return 'preferred';
  if (current === 'preferred') return 'unavailable';
  return null;
};

const Availability = () => {
  const { isLead, isAdmin } = useAuth();
  return (isLead || isAdmin) ? <TeamAvailability /> : <PersonalAvailability />;
};

// ── Personal availability (employee / shift manager) ─────────────────────
const PersonalAvailability = () => {
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [grid, setGrid] = useState({});
  const [lockedSlots, setLockedSlots] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // separate from `error` on purpose: this is only ever set by an actual
  // click on a locked cell, and auto-dismisses like a toast — it must never
  // be conflated with fetch/save errors or fire just from loading the page.
  const [lockNotice, setLockNotice] = useState('');
  const { currentUser } = useAuth();


  const weekDays = getWeekDays(weekStart);

  useEffect(() => {
    const loadAvailability = async () => {
      setLoading(true);
      setError('');
      try {
        const [data, myShifts] = await Promise.all([
          api.getAvailability({
            week_start: toDateString(weekStart),
            user_id: currentUser.id,
          }),
          api.getMyShifts({ week_start: toDateString(weekStart) }),
        ]);

        // build grid from API response
        // grid[day_of_week][slot] = status
        const newGrid = {};
        data.forEach(({ day_of_week, slot, status }) => {
          if (!newGrid[day_of_week]) newGrid[day_of_week] = {};
          newGrid[day_of_week][slot] = status;
        });
        setGrid(newGrid);

        // published shifts lock their day/slot against further edits — a
        // shift spanning multiple slots (e.g. afternoon into evening) locks
        // every slot it overlaps, not just the one its start time falls into
        const locked = new Set();
        myShifts.forEach(s => {
          getOverlappingSlotKeys(s.start_time, s.end_time).forEach(k => locked.add(k));
        });
        setLockedSlots(locked);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadAvailability();
  }, [weekStart, currentUser.id]);

  const handleCellClick = (dayIndex, slot) => {
    if (lockedSlots.has(`${dayIndex}_${slot}`)) {
      setLockNotice('Cannot modify availability for a date with a published shift assignment.');
      setTimeout(() => setLockNotice(''), 4000);
      return;
    }

    const current = grid[dayIndex]?.[slot] || null;
    const next = cycleStatus(current);

    setGrid(prev => {
      const updated = { ...prev };
      if (!updated[dayIndex]) updated[dayIndex] = {};
      if (next === null) {
        delete updated[dayIndex][slot];
        if (Object.keys(updated[dayIndex]).length === 0) {
          delete updated[dayIndex];
        }
      } else {
        updated[dayIndex] = { ...updated[dayIndex], [slot]: next };
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      // build slots array from grid — "available" is the implicit default,
      // so only explicit preferred/unavailable overrides need to be sent
      const slots = [];
      Object.entries(grid).forEach(([dayIndex, slotMap]) => {
        Object.entries(slotMap).forEach(([slot, status]) => {
          if (status === 'available') return;
          slots.push({
            day_of_week: parseInt(dayIndex),
            slot,
            status,
          });
        });
      });

      if (slots.length === 0) {
        // clear the whole week
        await api.deleteAvailability(toDateString(weekStart));
      } else {
        await api.submitAvailability({
          week_start: toDateString(weekStart),
          slots,
        });
      }
      setSuccess('Availability saved successfully.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h2>My Availability</h2>
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

        <div className="avail-legend">
          <span className="legend-item">
            <span className="legend-dot yellow" /> Available (default)
          </span>
          <span className="legend-item">
            <span className="legend-dot green" /> Preferred
          </span>
          <span className="legend-item">
            <span className="legend-dot gray" /> Unavailable
          </span>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save week'}
        </button>
      </div>

      {error && <div className="page-error">{error}</div>}
      {success && <div className="success-message" style={{ marginBottom: '1rem' }}>{success}</div>}
      {lockNotice && <div className="warning-message" style={{ marginBottom: '1rem' }}>{lockNotice}</div>}

      {loading ? (
        <div className="page-loading">Loading availability...</div>
      ) : (
        <WeekTimeGrid
          weekDays={weekDays}
          isToday={isToday}
          renderDayLabel={day => day.toLocaleDateString('en-IL', { weekday: 'short', month: 'short', day: 'numeric' })}
          renderDay={(day, dayIndex) => SLOTS.flatMap(slot => {
            const status = grid[dayIndex]?.[slot] || null;
            const effective = status || 'available';
            const isLocked = lockedSlots.has(`${dayIndex}_${slot}`);
            return SLOT_HOURS[slot].map(([startHour, endHour], segIndex) => (
              <div
                key={`${slot}-${segIndex}`}
                className={`tg-avail ${effective} ${isLocked ? 'locked' : ''}`}
                style={eventBlockStyle({ startHour, endHour, col: 0, colCount: 1 })}
                onClick={() => handleCellClick(dayIndex, slot)}
                title={isLocked
                  ? 'Locked — you are scheduled to work this published shift'
                  : 'Click to cycle: available → preferred → unavailable'}
              >
                <span className="tg-avail-label">
                  {SLOT_LABELS[slot]}
                  {isLocked && <LuLock size={10} style={{ marginLeft: '0.25rem' }} />}
                </span>
                <span className="tg-avail-status">{effective}</span>
              </div>
            ));
          })}
        />
      )}
    </div>
  );
};

// ── Team availability (lead) ──────────────────────────────────────────────
// Reviewing many employees at once needs a scannable overview, not 7 full
// day-columns per person — a table with a compact per-day/slot indicator
// and a name search is far more useful for staffing decisions than reusing
// the personal single-employee time grid.
const PAGE_SIZE = 15;

const TeamAvailability = () => {
  const { currentUser, isAdmin } = useAuth();
  const { socket } = useSocket();
  // The single source of truth for "what date are we looking at" — week and
  // month navigation both move this one anchor (by 7 days or by a whole
  // calendar month respectively) and weekStart is always freshly derived
  // from it below. Previously weekStart itself was the stored state and
  // month-nav fed it back through addMonths(); because weekStart is a
  // Sunday (not necessarily the 1st), that round-trip could land back on
  // the same week (>> appearing to do nothing) or skip an extra week (<<
  // appearing to jump 2 months) depending on which weekday the 1st fell on.
  const [anchorDate, setAnchorDate] = useState(new Date());
  const weekStart = getWeekStart(anchorDate);
  const [employees, setEmployees] = useState([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [page, setPage] = useState(0);
  const [availability, setAvailability] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState(''); // '' = all departments (admin only)
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Only the very first fetch shows the full-page loader — a search
  // keystroke or page-turn re-runs the effect below too, and flipping
  // `loading` back to true for those would unmount this whole tree (inputs
  // included), stealing focus out of the search box mid-keystroke.
  const hasLoadedOnce = useRef(false);

  const weekDays = getWeekDays(weekStart);

  // Admins pick from every department; a lead never sees this (the backend
  // forces their own department regardless of what's passed anyway).
  useEffect(() => {
    if (!isAdmin) return;
    api.getDepartments().then(setDepartments).catch(err => setError(err.message));
  }, [isAdmin]);

  // Shared by the initial/week-change load below and the live socket refetch.
  // The employee roster is fetched a page at a time (an org can have far
  // more staff than fit on screen); availability is then restricted to just
  // that page's employees so a large department's whole week isn't pulled
  // for rows that aren't even visible.
  // `cancelledRef` lets a caller opt in to ignoring the result if a newer
  // request has since superseded this one (see the main effect below, where
  // every keystroke in the search box re-runs this and could otherwise let
  // an earlier, now-stale response clobber the latest one).
  const loadTeamAvailability = async (cancelledRef = { current: false }) => {
    // Same department/role/search/page filters go to both endpoints at
    // once — getTeamAvailability now resolves its own matching page of
    // users server-side (mirroring getUsers' own pagination), so it no
    // longer needs the roster's response to know which user_ids to fetch.
    // That's what lets these start concurrently instead of waterfalling.
    const commonFilters = {
      role: 'employee,shift_manager',
      ...(selectedDept ? { department_id: selectedDept } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };

    const [usersData, avail] = await Promise.all([
      api.getUsers(commonFilters),
      api.getTeamAvailability({ week_start: toDateString(weekStart), ...commonFilters }),
    ]);
    if (cancelledRef.current) return;
    setEmployees(usersData.items);
    setTotalEmployees(usersData.total);
    setAvailability(avail);
  };

  useEffect(() => {
    const cancelledRef = { current: false };
    const load = async () => {
      if (!hasLoadedOnce.current) setLoading(true);
      setError('');
      try {
        await loadTeamAvailability(cancelledRef);
      } catch (err) {
        if (!cancelledRef.current) setError(err.message);
      } finally {
        if (!cancelledRef.current) {
          setLoading(false);
          hasLoadedOnce.current = true;
        }
      }
    };
    load();
    return () => { cancelledRef.current = true; };
    // anchorDate.getTime() (a primitive) is the real dependency here — the
    // fetch itself only needs the week_start string weekStart derives from
    // it. loadTeamAvailability is intentionally left out of deps since it's
    // redefined every render anyway and always closes over the current
    // weekStart/selectedDept/search/page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorDate.getTime(), selectedDept, search, page]);

  // Live collaborative sync: an employee submitting/editing/clearing their
  // availability (see socketService.js emitAvailabilityUpdated call sites)
  // refetches this department's team availability automatically, same
  // pattern as Schedule.jsx/MyShifts.jsx. Admins have no single department_id
  // on their own user record, so they refetch unconditionally (respecting
  // whichever department filter they currently have selected); leads only
  // refetch for their own department's events.
  useEffect(() => {
    if (!socket) return;

    const handleAvailabilityUpdated = (payload) => {
      if (currentUser?.department_id && payload.department_id !== currentUser.department_id) return;
      loadTeamAvailability().catch(err => setError(err.message));
    };

    socket.on('availability:updated', handleAvailabilityUpdated);
    return () => socket.off('availability:updated', handleAvailabilityUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, currentUser?.department_id, anchorDate.getTime(), selectedDept, search, page]);

  const prevWeek = () => {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() - 7);
    setAnchorDate(d);
  };

  const nextWeek = () => {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() + 7);
    setAnchorDate(d);
  };

  // Jump exactly one calendar month at a time. addMonths always pins the
  // day to 1 before adjusting the month, so chaining these never rolls over
  // (e.g. Mar 31 -> Apr 31 becoming May) and — since anchorDate (not the
  // Sunday-snapped weekStart) is what's being shifted — every click moves
  // exactly one month with no drift. weekStart re-derives from the new
  // anchor on the next render, landing on the first week of that month.
  const prevMonth = () => setAnchorDate(d => addMonths(d, -1));
  const nextMonth = () => setAnchorDate(d => addMonths(d, 1));

  const goToToday = () => setAnchorDate(new Date());

  // grid[username][day_of_week][slot] = status
  const grid = {};
  availability.forEach(({ username, day_of_week, slot, status }) => {
    if (!grid[username]) grid[username] = {};
    if (!grid[username][day_of_week]) grid[username][day_of_week] = {};
    grid[username][day_of_week][slot] = status;
  });

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h2>Team Availability</h2>
        <p className="page-subtitle">{formatWeekRange(weekStart)}</p>
      </div>

      <div className="schedule-controls">
        <div className="week-nav">
          <button className="btn btn-secondary icon-btn" onClick={prevMonth} title="Previous month">
            <LuChevronsLeft size={16} />
          </button>
          <button className="btn btn-secondary icon-btn" onClick={prevWeek} title="Previous week">
            <LuChevronLeft size={16} />
          </button>
          <button className="btn btn-secondary" onClick={goToToday}>
            Today
          </button>
          <button className="btn btn-secondary icon-btn" onClick={nextWeek} title="Next week">
            <LuChevronRight size={16} />
          </button>
          <button className="btn btn-secondary icon-btn" onClick={nextMonth} title="Next month">
            <LuChevronsRight size={16} />
          </button>
        </div>

        {isAdmin && (
          <select
            className="dept-select"
            value={selectedDept}
            onChange={e => { setSelectedDept(e.target.value); setPage(0); }}
          >
            <option value="">All departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}

        <div className="search-wrap">
          <LuSearch size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search employees..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>

        <div className="avail-legend">
          <span className="legend-item">
            <span className="legend-dot yellow" /> Available
          </span>
          <span className="legend-item">
            <span className="legend-dot green" /> Preferred
          </span>
          <span className="legend-item">
            <span className="legend-dot gray" /> Unavailable
          </span>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Loading team availability...</div>
      ) : employees.length === 0 ? (
        <p className="empty-state">
          {search.trim() ? 'No employees match your search.' : 'No employees found.'}
        </p>
      ) : (
        <div className="team-avail-table-wrap">
          <table className="team-avail-table">
            <thead>
              <tr>
                <th className="team-avail-name-col">Employee</th>
                {weekDays.map((day, i) => (
                  <th key={i} className={isToday(day) ? 'today' : ''}>{formatDay(day)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.username}>
                  <td className="team-avail-name-col">
                    <span className="team-avail-name">{emp.name}</span>
                    {emp.role === 'shift_manager' && <span className="sm-badge">SM</span>}
                  </td>
                  {weekDays.map((day, dayIndex) => {
                    const dayData = grid[emp.username]?.[dayIndex] || {};
                    return (
                      <td key={dayIndex}>
                        <div className="team-avail-slots">
                          {SLOTS.map(slot => {
                            const status = dayData[slot] || 'available';
                            return (
                              <span
                                key={slot}
                                className={`team-avail-dot ${status}`}
                                title={`${SLOT_LABELS[slot]}: ${status}`}
                              >
                                {SLOT_LABELS[slot][0]}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={totalEmployees} onPageChange={setPage} />
    </div>
  );
};

export default Availability;
