import { HOUR_HEIGHT, hoursToPx } from '../utils/weekGridUtils';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const WeekTimeGrid = ({
  weekDays,
  isToday,
  renderDayLabel,
  onDayLabelClick,
  renderDay,
}) => {
  return (
    <div className="week-timegrid">
      <div className="week-timegrid-headerrow">
        <div className="week-timegrid-corner" />
        <div className="week-timegrid-daylabels">
          {weekDays.map((day, i) => (
            <div
              key={i}
              className={`week-timegrid-daylabel ${isToday(day) ? 'today' : ''} ${onDayLabelClick ? 'clickable' : ''}`}
              onClick={onDayLabelClick ? () => onDayLabelClick(day) : undefined}
            >
              {renderDayLabel(day)}
            </div>
          ))}
        </div>
      </div>

      <div className="week-timegrid-body" style={{ height: hoursToPx(24) }}>
        <div className="week-timegrid-hours">
          {HOURS.map(h => (
            <div key={h} className="week-timegrid-hour" style={{ height: HOUR_HEIGHT }}>
              <span>{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>
        <div className="week-timegrid-days">
          {weekDays.map((day, i) => (
            <div key={i} className={`week-timegrid-daycol ${isToday(day) ? 'today' : ''}`}>
              {renderDay(day, i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeekTimeGrid;
