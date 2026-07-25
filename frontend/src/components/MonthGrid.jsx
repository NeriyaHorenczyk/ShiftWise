import { isSameMonth, isSameDay } from '../utils/dateUtils';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// selectedWeekStart is the Sunday of whichever week the shared anchorDate
// currently falls in (same value the Week view would show) — every week
// row is just checked against it, so the highlight tracks the </>-arrow
// navigation automatically without Month view needing its own week state.
const MonthGrid = ({ monthStart, weeks, isToday, selectedWeekStart, renderDay }) => {
  return (
    <div className="month-grid">
      <div className="month-grid-weekdays">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className="month-grid-weekday">{label}</div>
        ))}
      </div>

      <div className="month-grid-body">
        {weeks.map((week, i) => (
          <div
            key={i}
            className={`month-grid-week ${selectedWeekStart && isSameDay(week[0], selectedWeekStart) ? 'selected-week' : ''}`}
          >
            {week.map((day, j) => (
              <div
                key={j}
                className={`month-grid-day ${isSameMonth(day, monthStart) ? '' : 'outside'} ${isToday(day) ? 'today' : ''}`}
              >
                <div className="month-grid-daynum">{day.getDate()}</div>
                <div className="month-grid-dayevents">
                  {renderDay(day)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MonthGrid;
