export const HOUR_HEIGHT = 40; // px per hour

export const hoursToPx = (hours) => hours * HOUR_HEIGHT;

// Shift blocks under ~1.5h need a floor on rendered height so their
// title/time/status badge don't get clipped. Shared by Schedule and My
// Shifts so both week-grid calendars clip short shifts identically.
export const SHIFT_EVENT_MIN_HEIGHT = 61;
export const SHIFT_EVENT_MIN_DURATION_HOURS = SHIFT_EVENT_MIN_HEIGHT / HOUR_HEIGHT;

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
// minDurationHours must match whatever minHeight (in hours) eventBlockStyle
// will render for these events — otherwise a short event visually stretched
// taller than its real time range can overlap the next one on screen even
// though this function judged them non-overlapping and put both in column 0.
//
// colCount is computed per overlap-cluster, not for the whole day: an event
// with no real neighbors should get the full column width even if some other,
// unrelated pair of events elsewhere that day needed 2 columns.
export const layoutColumns = (events, minDurationHours = 0) => {
  const sorted = [...events].sort((a, b) => a.startHour - b.startHour);
  const effectiveEndOf = (ev) => Math.max(ev.endHour, ev.startHour + minDurationHours);

  const result = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const colEnds = [];
    const withCols = cluster.map(ev => {
      const effectiveEnd = effectiveEndOf(ev);
      let col = colEnds.findIndex(end => end <= ev.startHour);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(effectiveEnd);
      } else {
        colEnds[col] = effectiveEnd;
      }
      return { ...ev, col };
    });
    const colCount = colEnds.length || 1;
    result.push(...withCols.map(ev => ({ ...ev, colCount })));
    cluster = [];
  };

  for (const ev of sorted) {
    if (cluster.length > 0 && ev.startHour < clusterEnd) {
      cluster.push(ev);
      clusterEnd = Math.max(clusterEnd, effectiveEndOf(ev));
    } else {
      flushCluster();
      cluster = [ev];
      clusterEnd = effectiveEndOf(ev);
    }
  }
  flushCluster();

  return result;
};

// Positioning helper for an event block placed inside a day column.
// minHeight keeps very short events (e.g. sub-1.5h shifts) tall enough for
// their title/time/badge to stay legible instead of being clipped.
export const eventBlockStyle = ({ startHour, endHour, col = 0, colCount = 1 }, minHeight = 20) => ({
  position: 'absolute',
  top: hoursToPx(startHour),
  height: Math.max(hoursToPx(endHour - startHour), minHeight),
  left: `calc(${(100 / colCount) * col}% + 2px)`,
  width: `calc(${100 / colCount}% - 4px)`,
});

// Must match getSlot() in backend/src/controllers/shiftController.js so
// availability-based filtering (manual assignment, auto-assign) lines up
// with how the server classifies a shift's start time into a slot.
export const getSlotForHour = (hour) => {
  if (hour >= 6 && hour < 13) return 'morning';
  if (hour >= 13 && hour < 20) return 'afternoon';
  return 'evening';
};
