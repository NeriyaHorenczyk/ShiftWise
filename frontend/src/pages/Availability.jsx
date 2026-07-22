import { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  getWeekStart,
  getWeekDays,
  toDateString,
  formatWeekRange,
  isToday,
} from '../utils/dateUtils';
import { eventBlockStyle } from '../utils/weekGridUtils';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
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
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [grid, setGrid] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { currentUser } = useAuth();


  const weekDays = getWeekDays(weekStart);

  useEffect(() => {
    const loadAvailability = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.getAvailability({
          week_start: toDateString(weekStart),
          user_id: currentUser.id,
        });

        // build grid from API response
        // grid[day_of_week][slot] = status
        const newGrid = {};
        data.forEach(({ day_of_week, slot, status }) => {
          if (!newGrid[day_of_week]) newGrid[day_of_week] = {};
          newGrid[day_of_week][slot] = status;
        });
        setGrid(newGrid);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadAvailability();
  }, [weekStart, currentUser.id]);

  const handleCellClick = (dayIndex, slot) => {
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
            return SLOT_HOURS[slot].map(([startHour, endHour], segIndex) => (
              <div
                key={`${slot}-${segIndex}`}
                className={`tg-avail ${effective}`}
                style={eventBlockStyle({ startHour, endHour, col: 0, colCount: 1 })}
                onClick={() => handleCellClick(dayIndex, slot)}
                title="Click to cycle: available → preferred → unavailable"
              >
                <span className="tg-avail-label">{SLOT_LABELS[slot]}</span>
                <span className="tg-avail-status">{effective}</span>
              </div>
            ));
          })}
        />
      )}
    </div>
  );
};

export default Availability;
