// Classifies an hour-of-day into the three availability slots. Shared by
// shiftController (auto-assign, manual-assignment filtering) and
// availabilityController (locking published-shift slots) so they can never
// drift out of sync with each other.
export const getSlot = (hour) => {
  if (hour >= 6 && hour < 13) return 'morning';
  if (hour >= 13 && hour < 20) return 'afternoon';
  return 'evening'; // 20:00–06:00
};

// Given a shift's [start, end) span, returns every "{dayOfWeek}_{slot}" key
// the shift's time range touches. A shift crossing a slot boundary (e.g.
// 15:00-21:00, afternoon into evening) must lock every slot it overlaps —
// not just the one its start time happens to fall into.
export const getOverlappingSlotKeys = (start, end) => {
  const keys = new Set();
  let cursor = new Date(start);
  const endTime = new Date(end);

  while (cursor < endTime) {
    const hour = cursor.getHours();
    keys.add(`${cursor.getDay()}_${getSlot(hour)}`);

    // advance to the next slot-or-day boundary (6:00 / 13:00 / 20:00 /
    // midnight) — the day flips at midnight even though "evening" (20:00
    // to 06:00) keeps the same slot label across it.
    const next = new Date(cursor);
    next.setMinutes(0, 0, 0);
    if (hour < 6) next.setHours(6);
    else if (hour < 13) next.setHours(13);
    else if (hour < 20) next.setHours(20);
    else next.setHours(24);

    cursor = next < endTime ? next : endTime;
  }

  return keys;
};

export const toDateStr = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
