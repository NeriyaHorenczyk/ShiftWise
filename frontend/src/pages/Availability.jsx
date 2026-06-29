import { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  getWeekStart,
  getWeekDays,
  toDateString,
  formatWeekRange,
  isToday,
} from '../utils/dateUtils';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

const SLOTS = ['morning', 'afternoon', 'evening'];
const SLOT_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };

// cycle: null → available → preferred → null
const cycleStatus = (current) => {
  if (!current) return 'available';
  if (current === 'available') return 'preferred';
  return null;
};

const Availability = () => {
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [grid, setGrid] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const weekDays = getWeekDays(weekStart);

  useEffect(() => {
    const loadAvailability = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.getAvailability({
          week_start: toDateString(weekStart),
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
  }, [weekStart]);

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
      // build slots array from grid
      const slots = [];
      Object.entries(grid).forEach(([dayIndex, slotMap]) => {
        Object.entries(slotMap).forEach(([slot, status]) => {
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

  const getSlotClass = (status) => {
    if (status === 'preferred') return 'avail-slot preferred';
    if (status === 'available') return 'avail-slot available';
    return 'avail-slot';
  };

  return (
    <div className="page">
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
            <span className="legend-dot gray" /> Unavailable
          </span>
          <span className="legend-item">
            <span className="legend-dot yellow" /> Available
          </span>
          <span className="legend-item">
            <span className="legend-dot green" /> Preferred
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
        <div className="schedule-grid">
          {weekDays.map((day, dayIndex) => (
            <div
              key={dayIndex}
              className={`schedule-day ${isToday(day) ? 'today' : ''}`}
              style={{ cursor: 'default' }}
            >
              <div className="schedule-day-header">
                <span className="day-name">
                  {day.toLocaleDateString('en-IL', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              </div>

              <div className="avail-slots">
                {SLOTS.map(slot => {
                  const status = grid[dayIndex]?.[slot] || null;
                  return (
                    <div
                      key={slot}
                      className={getSlotClass(status)}
                      onClick={() => handleCellClick(dayIndex, slot)}
                      title={`Click to cycle: unavailable → available → preferred`}
                    >
                      <span className="slot-label">{SLOT_LABELS[slot]}</span>
                      {status && <span className="slot-status">{status}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Availability;