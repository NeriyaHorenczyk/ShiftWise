import { noData, success, validationError, serverError } from '../utils/response.js';
import { resolveShiftsDepartmentId, queryShiftsList } from './shiftController.js';
import { queryTeamAvailability } from './availabilityController.js';
import { queryLeaveRequestsForRequester } from './leaveController.js';
import { queryUsersForRequester } from './usersController.js';

// Every Sunday-aligned week_start a [start_date, end_date] range touches —
// mirrors the frontend's own Sunday-start week convention (dateUtils.js:
// getWeekStart/getMonthGridWeeks), so month view gets availability for
// exactly the weeks it renders, no more and no fewer. Dates are treated as
// UTC-midnight throughout so this can't drift a day depending on the
// server's local timezone.
const getWeekStartsInRange = (startDateStr, endDateStr) => {
  const cursor = new Date(`${startDateStr}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());
  const end = new Date(`${endDateStr}T00:00:00Z`);

  const weekStarts = [];
  while (cursor <= end) {
    weekStarts.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return weekStarts;
};

// The Schedule page's single load-bearing endpoint: shifts for the
// requested window, plus — for admins/leads, the only roles that ever open
// the assign modal — everything that modal needs (team availability for
// every week in view, this department's leave requests, and the user
// directory). One HTTP round trip instead of the page firing shifts,
// availability, leave, and users as separate parallel requests.
export const getScheduleOverview = async (req, res) => {
  try {
    const { department_id, week_start, start_date, end_date, status } = req.query;

    if (!week_start && !(start_date && end_date))
      return validationError(res, 'week_start or start_date and end_date are required.');

    const resolved = await resolveShiftsDepartmentId(req, department_id);
    if (resolved.denied) {
      return noData(res, resolved.denied, {
        shifts: [], teamAvailabilityByWeek: {}, leaveRequests: [], users: [],
      });
    }

    const shifts = await queryShiftsList({
      department_id: resolved.department_id,
      week_start, start_date, end_date, status,
      role: req.user.role,
    });

    // Employees/shift_managers only ever see the read-only calendar — the
    // availability/leave/user-directory endpoints these back are role-gated
    // to admin/lead anyway, so this mirrors that access rule rather than
    // quietly working around it.
    if (!['admin', 'lead'].includes(req.user.role)) {
      return success(res, { shifts, teamAvailabilityByWeek: {}, leaveRequests: [], users: [] });
    }

    const weekStarts = start_date && end_date
      ? getWeekStartsInRange(start_date, end_date)
      : [week_start];

    const [availabilityByWeekRows, leaveRequests, users] = await Promise.all([
      Promise.all(weekStarts.map(ws =>
        queryTeamAvailability({ week_start: ws, department_id: resolved.department_id })
      )),
      queryLeaveRequestsForRequester(req, { department_id: resolved.department_id }),
      queryUsersForRequester(req, { department_id: resolved.department_id }),
    ]);

    const teamAvailabilityByWeek = {};
    weekStarts.forEach((ws, i) => { teamAvailabilityByWeek[ws] = availabilityByWeekRows[i]; });

    success(res, { shifts, teamAvailabilityByWeek, leaveRequests, users });
  } catch (err) {
    serverError(res, err.message);
  }
};
