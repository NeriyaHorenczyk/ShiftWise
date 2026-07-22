export const HOUR_HEIGHT = 40; // px per hour

export const hoursToPx = (hours) => hours * HOUR_HEIGHT;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Splits a [start, end) range into one segment per calendar day it touches,
// each expressed as hour-of-day offsets, so a range crossing midnight
// renders as two separate blocks instead of one broken/negative-height block.
export const splitIntoDaySegments = (start, end) => {
  const segments = [];
  let cursor = new Date(start);
  const endTime = new Date(end);
  while (cursor < endTime) {
    const dayStart = startOfDay(cursor);
    const nextDayStart = new Date(dayStart);
    nextDayStart.setDate(nextDayStart.getDate() + 1);
    const segmentEnd = endTime < nextDayStart ? endTime : nextDayStart;
    segments.push({
      dayStart,
      startHour: (cursor - dayStart) / 3600000,
      endHour: (segmentEnd - dayStart) / 3600000,
    });
    cursor = segmentEnd;
  }
  return segments;
};

// Greedy interval-graph coloring: assigns overlapping events to side-by-side
// columns instead of letting them render on top of each other.
export const layoutColumns = (events) => {
  const sorted = [...events].sort((a, b) => a.startHour - b.startHour);
  const colEnds = [];
  const withCols = sorted.map(ev => {
    let col = colEnds.findIndex(end => end <= ev.startHour);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(ev.endHour);
    } else {
      colEnds[col] = ev.endHour;
    }
    return { ...ev, col };
  });
  const colCount = colEnds.length || 1;
  return withCols.map(ev => ({ ...ev, colCount }));
};

// Positioning helper for an event block placed inside a day column.
export const eventBlockStyle = ({ startHour, endHour, col = 0, colCount = 1 }) => ({
  position: 'absolute',
  top: hoursToPx(startHour),
  height: Math.max(hoursToPx(endHour - startHour), 20),
  left: `calc(${(100 / colCount) * col}% + 2px)`,
  width: `calc(${100 / colCount}% - 4px)`,
});
