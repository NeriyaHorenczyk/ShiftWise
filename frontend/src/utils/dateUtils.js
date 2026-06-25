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
  return date.toISOString().split('T')[0];
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