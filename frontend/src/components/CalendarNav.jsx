import {
  LuChevronsLeft,
  LuChevronLeft,
  LuChevronRight,
  LuChevronsRight,
} from 'react-icons/lu';

// Shared date-navigation controls for the Schedule / My Shifts calendars.
// The single arrows always step by a week and the double arrows always
// step by a month, regardless of which view (week/month) is currently
// displayed — the displayed grid is just whatever window contains the
// anchor date these buttons move.
const CalendarNav = ({ viewMode, onViewModeChange, onPrevMonth, onPrevWeek, onToday, onNextWeek, onNextMonth }) => {
  return (
    <>
      <div className="week-nav">
        <button className="btn btn-secondary icon-btn" onClick={onPrevMonth} title="Previous month">
          <LuChevronsLeft size={16} />
        </button>
        <button className="btn btn-secondary icon-btn" onClick={onPrevWeek} title="Previous week">
          <LuChevronLeft size={16} />
        </button>
        <button className="btn btn-secondary" onClick={onToday}>
          Today
        </button>
        <button className="btn btn-secondary icon-btn" onClick={onNextWeek} title="Next week">
          <LuChevronRight size={16} />
        </button>
        <button className="btn btn-secondary icon-btn" onClick={onNextMonth} title="Next month">
          <LuChevronsRight size={16} />
        </button>
      </div>

      <div className="view-toggle">
        <button
          className={`btn ${viewMode === 'week' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onViewModeChange('week')}
        >
          Week
        </button>
        <button
          className={`btn ${viewMode === 'month' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onViewModeChange('month')}
        >
          Month
        </button>
      </div>
    </>
  );
};

export default CalendarNav;
