import pool from '../../db/connection.js';
import { chatCompletion, AIServiceError } from '../services/aiService.js';
import { success, validationError, serviceUnavailable, serverError } from '../utils/response.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayLabel = (date) => date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const timeLabel = (date) => date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// Each AI feature gets its own tailored closing instruction rather than one
// shared block — the Auditor genuinely needs room for a structured, bulleted
// report, while Copilot answers and leave-request rewrites should stay
// short. Paired with the 600-token cap in aiService.js (generous enough for
// the Auditor's report; the other two are kept brief by instruction, not by
// running out of tokens).
const COPILOT_STYLE = `Be direct, professional, and clear. Give the recommended solution upfront (e.g. 3-6 sentences), followed by a brief 1-line rationale if necessary. Avoid repeating context back to the user or outlining your step-by-step thinking unless asked.`;

const AUDITOR_STYLE = `Write a clear, structured report using exactly these three headings, word-for-word, in this order:
Highlights
Potential Burnout/Gaps
Recommendations

Use as much detail as necessary to be genuinely useful, but stay under those three headings — do not restate the raw data verbatim, and do not repeat the same point in different words across sections. The Recommendations section is mandatory and must contain at least one concrete, actionable suggestion (e.g. "reassign X to the understaffed shift on Y" or "reduce Z's hours next week") — never leave it out or replace it with more analysis.`;

// Resolves the department a manager is acting on, mirroring the same
// enforcement used everywhere else in the app: a lead is always pinned to
// their own department server-side, never trusting a client-supplied one.
const resolveManagerDept = async (req) => {
  if (req.user.role === 'lead') {
    const [[dept]] = await pool.query('SELECT id, name FROM departments WHERE lead_id = ? AND deleted_at IS NULL', [req.user.id]);
    return dept || null;
  }
  const { department_id } = req.body;
  if (!department_id) return null;
  const [[dept]] = await pool.query('SELECT id, name FROM departments WHERE id = ? AND deleted_at IS NULL', [department_id]);
  return dept || null;
};

// Builds the compact, human-readable context the Copilot chat prompt is
// grounded in — a short bullet summary, not a raw DB dump, to keep the
// prompt small and the model from getting distracted by irrelevant fields.
const buildWeekContext = async (departmentId, weekStart) => {
  const [shifts] = await pool.query(
    `SELECT s.id, s.title, s.start_time, s.end_time, s.status, s.required_staff,
            COUNT(sa.id) AS assigned_count
     FROM shifts s
     LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
     WHERE s.department_id = ?
       AND DATE(s.start_time) >= ? AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)
       AND s.deleted_at IS NULL
     GROUP BY s.id
     ORDER BY s.start_time ASC`,
    [departmentId, weekStart, weekStart]
  );

  let assigneesByShift = {};
  if (shifts.length > 0) {
    const [assignees] = await pool.query(
      `SELECT sa.shift_id, u.name, sa.is_shift_manager
       FROM shift_assignments sa
       JOIN users u ON u.id = sa.user_id
       WHERE sa.shift_id IN (?)`,
      [shifts.map(s => s.id)]
    );
    assigneesByShift = assignees.reduce((acc, a) => {
      (acc[a.shift_id] ||= []).push(a.is_shift_manager ? `${a.name} (SM)` : a.name);
      return acc;
    }, {});
  }

  const [employees] = await pool.query(
    `SELECT name, role FROM users WHERE department_id = ? AND role IN ('employee', 'shift_manager') AND deleted_at IS NULL ORDER BY name`,
    [departmentId]
  );

  const [availability] = await pool.query(
    `SELECT a.day_of_week, a.slot, a.status, u.name
     FROM availability a
     JOIN users u ON u.id = a.user_id
     WHERE u.department_id = ? AND a.week_start = ? AND a.status != 'available' AND u.deleted_at IS NULL
     ORDER BY a.day_of_week, a.slot`,
    [departmentId, weekStart]
  );

  const [leave] = await pool.query(
    `SELECT u.name, lr.status, lr.start_date, lr.end_date
     FROM leave_requests lr
     JOIN users u ON u.id = lr.user_id
     WHERE u.department_id = ? AND lr.status IN ('pending', 'approved')
       AND lr.start_date <= DATE_ADD(?, INTERVAL 6 DAY) AND lr.end_date >= ?
       AND u.deleted_at IS NULL AND lr.deleted_at IS NULL
     ORDER BY lr.start_date`,
    [departmentId, weekStart, weekStart]
  );

  const shiftLines = shifts.length
    ? shifts.map(s => {
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        const names = assigneesByShift[s.id]?.join(', ') || 'nobody yet';
        return `- ${dayLabel(start)}, ${timeLabel(start)}–${timeLabel(end)} "${s.title}" (${s.status}) — assigned: ${names} (${s.assigned_count}/${s.required_staff})`;
      }).join('\n')
    : '(no shifts scheduled this week)';

  const employeeLines = employees.length
    ? employees.map(e => `- ${e.name} (${e.role === 'shift_manager' ? 'shift manager' : 'employee'})`).join('\n')
    : '(no employees in this department)';

  const availabilityLines = availability.length
    ? availability.map(a => `- ${a.name}: ${DAY_NAMES[a.day_of_week]} ${a.slot} = ${a.status}`).join('\n')
    : '(everyone is available all week — no unavailable/preferred entries submitted)';

  const leaveLines = leave.length
    ? leave.map(l => `- ${l.name}: ${l.status}, ${l.start_date} to ${l.end_date}`).join('\n')
    : '(no leave requests overlap this week)';

  return { shiftLines, employeeLines, availabilityLines, leaveLines };
};

// POST /ai/chat — ShiftWise Copilot
export const chat = async (req, res) => {
  try {
    const { message, week_start } = req.body;
    if (!message?.trim()) return validationError(res, 'message is required.');
    if (!week_start) return validationError(res, 'week_start is required.');

    const dept = await resolveManagerDept(req);
    if (!dept) return validationError(res, 'You are not assigned to manage a department.');

    const { shiftLines, employeeLines, availabilityLines, leaveLines } = await buildWeekContext(dept.id, week_start);

    const systemPrompt = `You are ShiftWise Copilot, an AI assistant embedded in a shift-scheduling app. You are helping a manager in the "${dept.name}" department plan and troubleshoot their team's schedule for the week of ${week_start}.

Only use the information given below — never invent employees, shifts, or dates that aren't listed here.

SHIFTS THIS WEEK:
${shiftLines}

EMPLOYEES IN THIS DEPARTMENT:
${employeeLines}

AVAILABILITY EXCEPTIONS THIS WEEK (everyone not listed is assumed available):
${availabilityLines}

LEAVE OVERLAPPING THIS WEEK:
${leaveLines}

Cross-reference the data above to answer the manager's question. If there isn't enough information to answer confidently, say so rather than guessing.

${COPILOT_STYLE}`;

    const reply = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message.trim() },
    ]);

    success(res, { reply });
  } catch (err) {
    if (err instanceof AIServiceError) return serviceUnavailable(res, err.message);
    serverError(res, err.message);
  }
};

// POST /ai/audit — AI Schedule Auditor & Fairness Report
export const auditSchedule = async (req, res) => {
  try {
    const { week_start } = req.body;
    if (!week_start) return validationError(res, 'week_start is required.');

    const dept = await resolveManagerDept(req);
    if (!dept) return validationError(res, 'You are not assigned to manage a department.');

    const [workload] = await pool.query(
      `SELECT u.name,
              COUNT(sa.shift_id) AS shift_count,
              COALESCE(SUM(TIMESTAMPDIFF(MINUTE, s.start_time, s.end_time)), 0) / 60.0 AS hours
       FROM users u
       LEFT JOIN shift_assignments sa ON sa.user_id = u.id
       LEFT JOIN shifts s ON s.id = sa.shift_id
         AND DATE(s.start_time) >= ? AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)
         AND s.deleted_at IS NULL
       WHERE u.department_id = ? AND u.role IN ('employee', 'shift_manager') AND u.deleted_at IS NULL
       GROUP BY u.id, u.name
       ORDER BY hours DESC`,
      [week_start, week_start, dept.id]
    );

    const [shifts] = await pool.query(
      `SELECT s.title, s.start_time, s.required_staff, COUNT(sa.id) AS assigned_count
       FROM shifts s
       LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
       WHERE s.department_id = ?
         AND DATE(s.start_time) >= ? AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)
         AND s.deleted_at IS NULL
       GROUP BY s.id
       ORDER BY s.start_time ASC`,
      [dept.id, week_start, week_start]
    );

    const workloadLines = workload.length
      ? workload.map(w => `- ${w.name}: ${w.shift_count} shift${Number(w.shift_count) !== 1 ? 's' : ''}, ${Number(w.hours).toFixed(1)}h`).join('\n')
      : '(no employees in this department)';

    const coverageLines = shifts.length
      ? shifts.map(s => {
          const start = new Date(s.start_time);
          const status = s.assigned_count >= s.required_staff ? 'fully staffed' : 'UNDERSTAFFED';
          return `- ${dayLabel(start)}, ${timeLabel(start)} "${s.title}": ${s.assigned_count}/${s.required_staff} (${status})`;
        }).join('\n')
      : '(no shifts scheduled this week)';

    const systemPrompt = `You are ShiftWise's AI Schedule Auditor. Review the following weekly workload data for the "${dept.name}" department (week of ${week_start}) for fairness, burnout risk, and coverage gaps.

WORKLOAD THIS WEEK:
${workloadLines}

SHIFT COVERAGE THIS WEEK:
${coverageLines}

Only reference the data above — never invent employees or shifts. If everything looks fine, say so briefly under each heading rather than padding it out.

${AUDITOR_STYLE}`;

    const report = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Generate the fairness and burnout report for this week.' },
    ]);

    success(res, { report });
  } catch (err) {
    if (err instanceof AIServiceError) return serviceUnavailable(res, err.message);
    serverError(res, err.message);
  }
};

// POST /ai/refine-request — Smart Leave Request Assistant
export const refineLeaveRequest = async (req, res) => {
  try {
    const { reason, startDate, endDate } = req.body;
    if (!reason?.trim()) return validationError(res, 'reason is required.');
    if (!startDate || !endDate) return validationError(res, 'startDate and endDate are required.');

    const refinedText = await chatCompletion([
      {
        role: 'system',
        content: `You are a helpful writing assistant embedded in an HR system. Rewrite the employee's short note into a polite, professional, formal leave-request reason — 2-5 sentences, no more.

You are given the exact leave dates below — you MUST weave them into the rewritten text naturally (e.g. "I would like to request leave from ${startDate} to ${endDate} due to..."). Never use a bracketed placeholder like "[Insert Date]" or "[Your Name]" — always use the real dates given, and never invent a name since none was given.

Preserve the original meaning and any specific facts mentioned in the note — do not invent details that weren't there. Return ONLY the rewritten text, with no preamble, quotation marks, or explanation.`,
      },
      { role: 'user', content: `Leave dates: ${startDate} to ${endDate}\nEmployee's note: ${reason.trim()}` },
    ], { temperature: 0.3 });

    success(res, { refinedText });
  } catch (err) {
    if (err instanceof AIServiceError) return serviceUnavailable(res, err.message);
    serverError(res, err.message);
  }
};
