import { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  getWeekStart,
  getWeekDays,
  toDateString,
  formatDay,
  formatWeekRange,
  isToday,
} from '../utils/dateUtils';
import { eventBlockStyle, getSlotForHour } from '../utils/weekGridUtils';
import { LuChevronLeft, LuChevronRight, LuSearch, LuLock } from 'react-icons/lu';
import useAuth from '../hooks/useAuth';
import WeekTimeGrid from '../components/WeekTimeGrid';

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
  const { isLead } = useAuth();
  return isLead ? <TeamAvailability /> : <PersonalAvailability />;
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

        // published shifts lock their day/slot against further edits
        setLockedSlots(new Set(myShifts.map(s => {
          const d = new Date(s.start_time);
          return `${d.getDay()}_${getSlotForHour(d.getHours())}`;
        })));
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
const TeamAvailability = () => {
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [employees, setEmployees] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const weekDays = getWeekDays(weekStart);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [users, avail] = await Promise.all([
          api.getUsers(),
          api.getTeamAvailability({ week_start: toDateString(weekStart) }),
        ]);
        setEmployees(users.filter(u => u.role === 'employee' || u.role === 'shift_manager'));
        setAvailability(avail);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
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

  // grid[username][day_of_week][slot] = status
  const grid = {};
  availability.forEach(({ username, day_of_week, slot, status }) => {
    if (!grid[username]) grid[username] = {};
    if (!grid[username][day_of_week]) grid[username][day_of_week] = {};
    grid[username][day_of_week][slot] = status;
  });

  const filteredEmployees = employees.filter(e => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return e.name?.toLowerCase().includes(q) || e.username?.toLowerCase().includes(q);
  });

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h2>Team Availability</h2>
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

        <div className="search-wrap">
          <LuSearch size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search employees..."
            value={search}
            onChange={e => setSearch(e.target.value)}
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
      ) : filteredEmployees.length === 0 ? (
        <p className="empty-state">No employees match your search.</p>
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
              {filteredEmployees.map(emp => (
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
    </div>
  );
};

export default Availability;
