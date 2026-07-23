// Get the Sunday of the week for a given date
export const getWeekStart = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Get array of 7 dates starting from weekStart
export const getWeekDays = (weekStart) => {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
};

// Format date to YYYY-MM-DD for API calls
export const toDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Format date for display
export const formatDay = (date) => {
  return date.toLocaleDateString('en-IL', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Format time from datetime string
export const formatTime = (dateStr) => {
  return new Date(dateStr).toLocaleTimeString('en-IL', { hour: '2-digit', minute: '2-digit' });
};

// Format week range for display e.g. "Jun 1 - Jun 7, 2025"
export const formatWeekRange = (weekStart) => {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const start = weekStart.toLocaleDateString('en-IL', { month: 'short', day: 'numeric' });
  const end = weekEnd.toLocaleDateString('en-IL', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${start} – ${end}`;
};

// Check if two dates are the same day
export const isSameDay = (date1, date2) => {
  return date1.toDateString() === date2.toDateString();
};

// Check if a date is today
export const isToday = (date) => isSameDay(date, new Date());

// Get the 1st of the month for a given date
export const getMonthStart = (date = new Date()) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Shift a date forward/backward by whole months, landing on the 1st
export const addMonths = (date, count) => {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + count);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Full calendar grid for a month: weeks (Sun-Sat) of Date objects, padded
// with the tail of the previous month and the head of the next so every
// row has 7 days — the days outside the target month are still returned
// (flagged via isSameMonth) so a real calendar renders no gaps.
export const getMonthGridWeeks = (monthStart) => {
  const firstCell = new Date(monthStart);
  firstCell.setDate(firstCell.getDate() - firstCell.getDay());

  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  monthEnd.setDate(0); // last day of target month

  const lastCell = new Date(monthEnd);
  lastCell.setDate(lastCell.getDate() + (6 - monthEnd.getDay()));

  const weeks = [];
  let cursor = new Date(firstCell);
  while (cursor <= lastCell) {
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(cursor);
      d.setDate(d.getDate() + i);
      return d;
    });
    weeks.push(week);
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
};

// Format a month for display e.g. "July 2026"
export const formatMonthLabel = (date) => {
  return date.toLocaleDateString('en-IL', { month: 'long', year: 'numeric' });
};

export const isSameMonth = (date1, date2) =>
  date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth();