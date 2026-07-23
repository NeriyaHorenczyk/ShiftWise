// Classifies an hour-of-day into the three availability slots. Shared by
// shiftController (auto-assign, manual-assignment filtering) and
// availabilityController (locking published-shift slots) so they can never
// drift out of sync with each other.
export const getSlot = (hour) => {
  if (hour >= 6 && hour < 13) return 'morning';
  if (hour >= 13 && hour < 20) return 'afternoon';
  return 'evening'; // 20:00–06:00
};

export const toDateStr = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
