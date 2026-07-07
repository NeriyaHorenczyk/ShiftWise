import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail, shiftPublishedEmail, shiftUnpublishedEmail, weekPublishedEmail } from '../utils/email.js';

export const getAllShifts = async (req, res) => {
  try {
    const { department_id, week_start, status } = req.query;

    let query = `
      SELECT 
        s.id, s.title, s.start_time, s.end_time,
        s.required_staff, s.status,
        d.name AS department_name,
        u.name AS created_by_name,
        COUNT(sa.user_id) AS assigned_count
      FROM shifts s
      LEFT JOIN departments d ON s.department_id = d.id
      LEFT JOIN users u ON s.created_by = u.id
      LEFT JOIN shift_assignments sa ON s.id = sa.shift_id
    `;

    const conditions = [];
    const params = [];

    if (department_id) {
      conditions.push('s.department_id = ?');
      params.push(department_id);
    }
    if (week_start) {
      conditions.push('DATE(s.start_time) >= ? AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)');
      params.push(week_start, week_start);
    }
    if (status) {
      conditions.push('s.status = ?');
      params.push(status);
    }

    // employees only see published shifts
    if (['employee', 'shift_manager'].includes(req.user.role)) {
      conditions.push('s.status = ?');
      params.push('published');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY s.id ORDER BY s.start_time ASC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getShiftById = async (req, res) => {
  try {
    const [shifts] = await pool.query(`
      SELECT 
        s.id, s.title, s.start_time, s.end_time,
        s.required_staff, s.status,
        d.name AS department_name,
        u.name AS created_by_name
      FROM shifts s
      LEFT JOIN departments d ON s.department_id = d.id
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id = ?
    `, [req.params.id]);

    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });

    // fetch assigned employees separately
    const [assignments] = await pool.query(`
      SELECT 
        u.username, u.name, u.avatar_url,
        sa.is_shift_manager
      FROM shift_assignments sa
      JOIN users u ON sa.user_id = u.id
      WHERE sa.shift_id = ?
    `, [req.params.id]);

    res.json({ ...shifts[0], assignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyShifts = async (req, res) => {
  try {
    const { week_start } = req.query;

    let query = `
      SELECT 
        s.id, s.title, s.start_time, s.end_time,
        s.required_staff, s.status,
        d.name AS department_name,
        sa.is_shift_manager,
        COUNT(sa2.user_id) AS assigned_count
      FROM shift_assignments sa
      JOIN shifts s ON sa.shift_id = s.id
      JOIN departments d ON s.department_id = d.id
      LEFT JOIN shift_assignments sa2 ON s.id = sa2.shift_id
      WHERE sa.user_id = ?
        AND s.status = 'published'
    `;

    const params = [req.user.id];

    if (week_start) {
      query += ` AND DATE(s.start_time) >= ? AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)`;
      params.push(week_start, week_start);
    }

    query += ' GROUP BY s.id, sa.is_shift_manager ORDER BY s.start_time ASC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createShift = async (req, res) => {
  try {
    const { department_id, title, start_time, end_time, required_staff } = req.body;

    if (!department_id || !title || !start_time || !end_time)
      return res.status(400).json({ error: 'department_id, title, start_time and end_time are required.' });

    if (new Date(start_time) >= new Date(end_time))
      return res.status(400).json({ error: 'start_time must be before end_time.' });

    // leads can only create shifts for their own department
    if (req.user.role === 'lead') {
      const [depts] = await pool.query(
        'SELECT lead_id FROM departments WHERE id = ?',
        [department_id]
      );
      if (depts.length === 0)
        return res.status(404).json({ error: 'Department not found.' });
      if (depts[0].lead_id !== req.user.id)
        return res.status(403).json({ error: 'You can only create shifts for your own department.' });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO shifts (id, department_id, title, start_time, end_time, required_staff, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, department_id, title, start_time, end_time, required_staff || 1, req.user.id]
    );

    res.status(201).json({ message: 'Shift created successfully.', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateShift = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, start_time, end_time, required_staff } = req.body;

    const [shifts] = await pool.query('SELECT * FROM shifts WHERE id = ?', [id]);
    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });

    if (shifts[0].status === 'published')
      return res.status(400).json({ error: 'Cannot edit a published shift. Unpublish it first.' });

    if (start_time && end_time && new Date(start_time) >= new Date(end_time))
      return res.status(400).json({ error: 'start_time must be before end_time.' });

    await pool.query(
      `UPDATE shifts SET
        title = COALESCE(?, title),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        required_staff = COALESCE(?, required_staff)
      WHERE id = ?`,
      [title || null, start_time || null, end_time || null, required_staff || null, id]
    );

    res.json({ message: 'Shift updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteShift = async (req, res) => {
  try {
    const { id } = req.params;

    const [shifts] = await pool.query('SELECT id FROM shifts WHERE id = ?', [id]);
    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });

    await pool.query('DELETE FROM shifts WHERE id = ?', [id]);
    res.json({ message: 'Shift deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const publishShift = async (req, res) => {
  try {
    const { id } = req.params;

    const [shifts] = await pool.query(
      'SELECT * FROM shifts WHERE id = ?',
      [id]
    );
    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });
    if (shifts[0].status === 'published')
      return res.status(400).json({ error: 'Shift is already published.' });

    const [assignments] = await pool.query(
      'SELECT id FROM shift_assignments WHERE shift_id = ?',
      [id]
    );
    if (assignments.length === 0)
      return res.status(400).json({ error: 'Cannot publish a shift with no assigned employees.' });

    await pool.query(
      'UPDATE shifts SET status = ? WHERE id = ?',
      ['published', id]
    );

    // email assigned employees
    const [employees] = await pool.query(
      `SELECT u.email, u.name FROM shift_assignments sa
       JOIN users u ON sa.user_id = u.id WHERE sa.shift_id = ?`,
      [id]
    );
    await Promise.all(employees.map((emp) =>
      sendEmail(emp.email, `Shift published — ${shifts[0].title}`, shiftPublishedEmail(emp.name, shifts[0]))
    ));

    res.json({ message: 'Shift published successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export const unpublishShift = async (req, res) => {
  try {
    const { id } = req.params;
    const [shifts] = await pool.query('SELECT * FROM shifts WHERE id = ?', [id]);
    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });
    if (shifts[0].status === 'draft')
      return res.status(400).json({ error: 'Shift is already a draft.' });

    // email assigned employees before status changes (shifts[0] still has the data)
    const [employees] = await pool.query(
      `SELECT u.email, u.name FROM shift_assignments sa
       JOIN users u ON sa.user_id = u.id WHERE sa.shift_id = ?`,
      [id]
    );

    await pool.query('UPDATE shifts SET status = ? WHERE id = ?', ['draft', id]);

    await Promise.all(employees.map((emp) =>
      sendEmail(emp.email, `Shift update — ${shifts[0].title}`, shiftUnpublishedEmail(emp.name, shifts[0]))
    ));

    res.json({ message: 'Shift unpublished successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};;

export const assignEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, is_shift_manager } = req.body;

    if (!user_id)
      return res.status(400).json({ error: 'user_id is required.' });

    const [shifts] = await pool.query('SELECT * FROM shifts WHERE id = ?', [id]);
    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });

    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [user_id]);
    if (users.length === 0)
      return res.status(404).json({ error: 'User not found.' });

    // only shift_managers can be assigned as shift manager
    if (is_shift_manager && users[0].role !== 'shift_manager')
      return res.status(400).json({ error: 'Only shift managers can be assigned as shift manager for a shift.' });

    // only one shift manager allowed per shift
    if (is_shift_manager) {
      const [existing] = await pool.query(
        'SELECT id FROM shift_assignments WHERE shift_id = ? AND is_shift_manager = true',
        [id]
      );
      if (existing.length > 0)
        return res.status(409).json({ error: 'This shift already has a shift manager assigned.' });
    }

    const assignmentId = uuidv4();
    await pool.query(
      'INSERT INTO shift_assignments (id, shift_id, user_id, is_shift_manager) VALUES (?, ?, ?, ?)',
      [assignmentId, id, user_id, is_shift_manager || false]
    );

    res.status(201).json({ message: 'Employee assigned successfully.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Employee is already assigned to this shift.' });
    res.status(500).json({ error: err.message });
  }
};

const getSlot = (hour) => {
  if (hour >= 7 && hour < 15) return 'morning';
  if (hour >= 15 && hour < 23) return 'afternoon';
  return 'evening'; // 23:00–07:00
};

const overlaps = (busyList, start, end) =>
  busyList.some(b => b.start < end && b.end > start);

export const autoAssign = async (req, res) => {
  try {
    const { department_id, week_start } = req.body;
    if (!department_id || !week_start) {
      return res.status(400).json({ error: 'department_id and week_start are required.' });
    }

    const [[lead]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [req.user.id]);
    if (!lead || lead.department_id !== department_id) {
      return res.status(403).json({ error: 'You do not manage this department.' });
    }

    // 1. Draft shifts that still need more staff
    const [shifts] = await pool.query(
      `SELECT s.id, s.start_time, s.end_time, s.required_staff,
              COUNT(sa.id) AS assigned_count,
              COALESCE(SUM(sa.is_shift_manager), 0) AS sm_count
       FROM shifts s
       LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
       WHERE s.department_id = ?
         AND s.status = 'draft'
         AND DATE(s.start_time) >= ?
         AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)
       GROUP BY s.id
       HAVING assigned_count < s.required_staff
       ORDER BY s.start_time`,
      [department_id, week_start, week_start]
    );

    if (shifts.length === 0) {
      return res.json({ assigned: 0, message: 'All draft shifts are already fully staffed.' });
    }

    // 2. Employees in the department
    const [employees] = await pool.query(
      `SELECT id, role FROM users
       WHERE department_id = ? AND role IN ('employee', 'shift_manager')`,
      [department_id]
    );

    if (employees.length === 0) {
      return res.json({ assigned: 0, message: 'No employees in this department.' });
    }

    const employeeIds = employees.map(e => e.id);

    // 3. Availability for the week
    const [availability] = await pool.query(
      `SELECT user_id, day_of_week, slot, status
       FROM availability
       WHERE week_start = ? AND user_id IN (?)`,
      [week_start, employeeIds]
    );

    // availMap: `${userId}_${dayOfWeek}_${slot}` -> score  (preferred=3, available=2)
    const availMap = {};
    for (const a of availability) {
      availMap[`${a.user_id}_${a.day_of_week}_${a.slot}`] = a.status === 'preferred' ? 3 : 2;
    }

    // 4. All shifts this week to detect overlaps with already-assigned shifts
    const [allWeekShifts] = await pool.query(
      `SELECT id, start_time, end_time FROM shifts
       WHERE department_id = ?
         AND DATE(start_time) >= ?
         AND DATE(start_time) < DATE_ADD(?, INTERVAL 7 DAY)`,
      [department_id, week_start, week_start]
    );

    // busyMap: userId -> [{start, end}]
    const busyMap = {};
    for (const e of employees) busyMap[e.id] = [];

    if (allWeekShifts.length > 0) {
      const allIds = allWeekShifts.map(s => s.id);
      const [existing] = await pool.query(
        `SELECT sa.user_id, s.start_time, s.end_time
         FROM shift_assignments sa
         JOIN shifts s ON sa.shift_id = s.id
         WHERE sa.shift_id IN (?)`,
        [allIds]
      );
      for (const a of existing) {
        if (busyMap[a.user_id]) {
          busyMap[a.user_id].push({ start: new Date(a.start_time), end: new Date(a.end_time) });
        }
      }
    }

    const empRole = {};
    const workload = {}; // tracks total shifts assigned this week per employee
    for (const e of employees) {
      empRole[e.id] = e.role;
      workload[e.id] = busyMap[e.id].length; // pre-load with existing assignments
    }

    // Sort: shifts with no SM first, then by most open slots remaining
    const sortedShifts = [...shifts].sort((a, b) => {
      const aNeedsSm = Number(a.sm_count) === 0 ? 1 : 0;
      const bNeedsSm = Number(b.sm_count) === 0 ? 1 : 0;
      if (bNeedsSm !== aNeedsSm) return bNeedsSm - aNeedsSm;
      return (b.required_staff - Number(b.assigned_count)) - (a.required_staff - Number(a.assigned_count));
    });

    const newAssignments = [];

    for (const shift of sortedShifts) {
      const shiftStart = new Date(shift.start_time);
      const shiftEnd = new Date(shift.end_time);
      const dayOfWeek = shiftStart.getDay();
      const slot = getSlot(shiftStart.getHours());

      let openSlots = shift.required_staff - Number(shift.assigned_count);
      let hasSmAssigned = Number(shift.sm_count) > 0;

      const candidates = employees
        .filter(e => !overlaps(busyMap[e.id] || [], shiftStart, shiftEnd))
        .map(e => {
          const base = availMap[`${e.id}_${dayOfWeek}_${slot}`] || 0;
          const smBonus = !hasSmAssigned && empRole[e.id] === 'shift_manager' ? 0.5 : 0;
          return { id: e.id, score: base + smBonus, workload: workload[e.id] || 0 };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.workload - b.workload; // tiebreak: fewest shifts this week first
        });

      for (const candidate of candidates) {
        if (openSlots <= 0) break;

        const assignAsSm = !hasSmAssigned && empRole[candidate.id] === 'shift_manager' ? 1 : 0;
        newAssignments.push([uuidv4(), shift.id, candidate.id, assignAsSm]);
        busyMap[candidate.id].push({ start: shiftStart, end: shiftEnd });
        workload[candidate.id] = (workload[candidate.id] || 0) + 1;
        if (assignAsSm) hasSmAssigned = true;
        openSlots--;
      }
    }

    if (newAssignments.length === 0) {
      return res.json({ assigned: 0, message: 'No employees are available for the remaining slots.' });
    }

    await pool.query(
      'INSERT INTO shift_assignments (id, shift_id, user_id, is_shift_manager) VALUES ?',
      [newAssignments]
    );

    res.json({ assigned: newAssignments.length, noAvailability: availability.length === 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const bulkClear = async (req, res) => {
  try {
    const { department_id, week_start } = req.body;
    if (!department_id || !week_start) {
      return res.status(400).json({ error: 'department_id and week_start are required.' });
    }

    const [[user]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [req.user.id]);
    if (!user || user.department_id !== department_id) {
      return res.status(403).json({ error: 'You do not manage this department.' });
    }

    const [result] = await pool.query(
      `DELETE FROM shifts
       WHERE department_id = ?
         AND status = 'draft'
         AND DATE(start_time) >= ?
         AND DATE(start_time) < DATE_ADD(?, INTERVAL 7 DAY)`,
      [department_id, week_start, week_start]
    );

    res.json({ deleted: result.affectedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const bulkPublish = async (req, res) => {
  try {
    const { department_id, week_start } = req.body;
    if (!department_id || !week_start) {
      return res.status(400).json({ error: 'department_id and week_start are required.' });
    }

    const [[user]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [req.user.id]);
    if (!user || user.department_id !== department_id) {
      return res.status(403).json({ error: 'You do not manage this department.' });
    }

    const [result] = await pool.query(
      `UPDATE shifts s
       SET s.status = 'published'
       WHERE s.department_id = ?
         AND s.status = 'draft'
         AND DATE(s.start_time) >= ?
         AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)
         AND EXISTS (SELECT 1 FROM shift_assignments sa WHERE sa.shift_id = s.id)`,
      [department_id, week_start, week_start]
    );

    const [[{ skipped }]] = await pool.query(
      `SELECT COUNT(*) AS skipped FROM shifts
       WHERE department_id = ?
         AND status = 'draft'
         AND DATE(start_time) >= ?
         AND DATE(start_time) < DATE_ADD(?, INTERVAL 7 DAY)`,
      [department_id, week_start, week_start]
    );

    // email each employee once listing all their shifts for the week
    if (result.affectedRows > 0) {
      const [rows] = await pool.query(
        `SELECT s.title, s.start_time, s.end_time,
                u.id AS user_id, u.email, u.name AS user_name
         FROM shifts s
         JOIN shift_assignments sa ON sa.shift_id = s.id
         JOIN users u ON u.id = sa.user_id
         WHERE s.department_id = ?
           AND s.status = 'published'
           AND DATE(s.start_time) >= ?
           AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)
         ORDER BY s.start_time`,
        [department_id, week_start, week_start]
      );
      // group shifts by employee
      const byEmployee = {};
      for (const r of rows) {
        if (!byEmployee[r.user_id]) {
          byEmployee[r.user_id] = { email: r.email, name: r.user_name, shifts: [] };
        }
        byEmployee[r.user_id].shifts.push({ title: r.title, start_time: r.start_time, end_time: r.end_time });
      }
      await Promise.all(Object.values(byEmployee).map((emp) =>
        sendEmail(emp.email, 'Your schedule has been published', weekPublishedEmail(emp.name, emp.shifts))
      ));
    }

    res.json({ published: result.affectedRows, skipped: Number(skipped) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const unassignEmployee = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const [result] = await pool.query(
      'DELETE FROM shift_assignments WHERE shift_id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Assignment not found.' });

    res.json({ message: 'Employee unassigned successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};