import pool from '../../db/connection.js';
import { v4 as uuid } from 'uuid';

const toYMD = (d) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  // Use local date parts — .toISOString() converts to UTC first, which shifts the
  // date backward by one day for any timezone east of UTC (e.g. Israel UTC+3).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const buildDateStr = (year, month, dayOfMonth) => {
  return `${year}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
};

// JWT only carries id/username/role — fetch department_id from DB each time
const getUserDeptId = async (userId) => {
  const [[user]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [userId]);
  return user?.department_id || null;
};

// GET /blueprints
export const getBlueprint = async (req, res) => {
  try {
    const deptId = await getUserDeptId(req.user.id);
    if (!deptId) return res.status(400).json({ error: 'You are not assigned to a department.' });

    const [[blueprint]] = await pool.query(
      'SELECT * FROM shift_blueprints WHERE department_id = ?',
      [deptId]
    );

    if (!blueprint) return res.json(null);

    const [shifts] = await pool.query(
      'SELECT * FROM blueprint_shifts WHERE blueprint_id = ? ORDER BY day_of_week, start_time',
      [blueprint.id]
    );

    const [presets] = await pool.query(
      'SELECT * FROM blueprint_presets WHERE blueprint_id = ? ORDER BY title',
      [blueprint.id]
    );

    const [overrides] = await pool.query(
      'SELECT * FROM blueprint_overrides WHERE blueprint_id = ? ORDER BY override_date',
      [blueprint.id]
    );

    let overrideShifts = [];
    if (overrides.length > 0) {
      [overrideShifts] = await pool.query(
        `SELECT * FROM blueprint_override_shifts WHERE override_id IN (${overrides.map(() => '?').join(',')})`,
        overrides.map(o => o.id)
      );
    }

    const shiftsByOverride = {};
    for (const s of overrideShifts) {
      if (!shiftsByOverride[s.override_id]) shiftsByOverride[s.override_id] = [];
      shiftsByOverride[s.override_id].push({ ...s, needs_shift_manager: !!s.needs_shift_manager });
    }

    res.json({
      ...blueprint,
      shifts: shifts.map(s => ({ ...s, needs_shift_manager: !!s.needs_shift_manager })),
      presets: presets.map(p => ({ ...p, needs_shift_manager: !!p.needs_shift_manager })),
      overrides: overrides.map(o => ({
        ...o,
        override_date: toYMD(o.override_date),
        shifts: shiftsByOverride[o.id] || [],
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /blueprints
export const createBlueprint = async (req, res) => {
  try {
    const deptId = await getUserDeptId(req.user.id);
    if (!deptId) return res.status(400).json({ error: 'You are not assigned to a department.' });

    const { name = 'Standard Week' } = req.body;
    const id = uuid();
    try {
      await pool.query(
        'INSERT INTO shift_blueprints (id, department_id, name, created_by) VALUES (?, ?, ?, ?)',
        [id, deptId, name.trim(), req.user.id]
      );
    } catch (err) {
      if (err.errno === 1062) return res.status(409).json({ error: 'A blueprint already exists for this department.' });
      throw err;
    }

    res.status(201).json({ id, department_id: deptId, name: name.trim(), shifts: [], presets: [], overrides: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /blueprints/:id
export const updateBlueprint = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
    const deptId = await getUserDeptId(req.user.id);
    await pool.query(
      'UPDATE shift_blueprints SET name = ? WHERE id = ? AND department_id = ?',
      [name.trim(), req.params.id, deptId]
    );
    res.json({ message: 'Blueprint updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /blueprints/:id/shifts
export const addBlueprintShift = async (req, res) => {
  try {
    const { day_of_week, title, start_time, end_time, required_staff = 1, needs_shift_manager = false } = req.body;

    if (day_of_week === undefined || day_of_week === null || !title?.trim() || !start_time || !end_time) {
      return res.status(400).json({ error: 'day_of_week, title, start_time, and end_time are required.' });
    }

    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    const id = uuid();
    await pool.query(
      `INSERT INTO blueprint_shifts
       (id, blueprint_id, day_of_week, title, start_time, end_time, required_staff, needs_shift_manager)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, day_of_week, title.trim(), start_time, end_time, required_staff, needs_shift_manager ? 1 : 0]
    );

    res.status(201).json({
      id, blueprint_id: req.params.id, day_of_week, title: title.trim(),
      start_time, end_time, required_staff, needs_shift_manager: !!needs_shift_manager,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /blueprints/:id/shifts/:slotId
export const removeBlueprintShift = async (req, res) => {
  try {
    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    await pool.query('DELETE FROM blueprint_shifts WHERE id = ? AND blueprint_id = ?', [req.params.slotId, req.params.id]);
    res.json({ message: 'Shift slot removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /blueprints/:id/overrides
export const addBlueprintOverride = async (req, res) => {
  try {
    const { override_date, label } = req.body;
    if (!override_date || !label?.trim()) {
      return res.status(400).json({ error: 'override_date and label are required.' });
    }

    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    const id = uuid();
    try {
      await pool.query(
        'INSERT INTO blueprint_overrides (id, blueprint_id, override_date, label) VALUES (?, ?, ?, ?)',
        [id, req.params.id, override_date, label.trim()]
      );
    } catch (err) {
      if (err.errno === 1062) return res.status(409).json({ error: 'An override already exists for this date.' });
      throw err;
    }

    res.status(201).json({ id, blueprint_id: req.params.id, override_date, label: label.trim(), shifts: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /blueprints/:id/overrides/:ovId/shifts
export const addOverrideShift = async (req, res) => {
  try {
    const { title, start_time, end_time, required_staff = 1, needs_shift_manager = false } = req.body;
    if (!title?.trim() || !start_time || !end_time) {
      return res.status(400).json({ error: 'title, start_time, and end_time are required.' });
    }

    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    const [[ov]] = await pool.query(
      'SELECT id FROM blueprint_overrides WHERE id = ? AND blueprint_id = ?',
      [req.params.ovId, req.params.id]
    );
    if (!ov) return res.status(404).json({ error: 'Override not found.' });

    const id = uuid();
    await pool.query(
      `INSERT INTO blueprint_override_shifts
       (id, override_id, title, start_time, end_time, required_staff, needs_shift_manager)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.ovId, title.trim(), start_time, end_time, required_staff, needs_shift_manager ? 1 : 0]
    );

    res.status(201).json({
      id, override_id: req.params.ovId,
      title: title.trim(), start_time, end_time, required_staff,
      needs_shift_manager: !!needs_shift_manager,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /blueprints/:id/overrides/:ovId/shifts/:shiftId
export const removeOverrideShift = async (req, res) => {
  try {
    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    await pool.query(
      'DELETE FROM blueprint_override_shifts WHERE id = ? AND override_id = ?',
      [req.params.shiftId, req.params.ovId]
    );
    res.json({ message: 'Override shift removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /blueprints/:id/overrides/:ovId
export const removeBlueprintOverride = async (req, res) => {
  try {
    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    await pool.query('DELETE FROM blueprint_overrides WHERE id = ? AND blueprint_id = ?', [req.params.ovId, req.params.id]);
    res.json({ message: 'Override removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /blueprints/:id/presets
export const addPreset = async (req, res) => {
  try {
    const { title, start_time, end_time, required_staff = 1, needs_shift_manager = false } = req.body;
    if (!title?.trim() || !start_time || !end_time) {
      return res.status(400).json({ error: 'title, start_time, and end_time are required.' });
    }
    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    const id = uuid();
    await pool.query(
      `INSERT INTO blueprint_presets
       (id, blueprint_id, title, start_time, end_time, required_staff, needs_shift_manager)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, title.trim(), start_time, end_time, required_staff, needs_shift_manager ? 1 : 0]
    );
    res.status(201).json({ id, blueprint_id: req.params.id, title: title.trim(), start_time, end_time, required_staff, needs_shift_manager: !!needs_shift_manager });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /blueprints/:id/presets/:presetId
export const removePreset = async (req, res) => {
  try {
    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });
    await pool.query(
      'DELETE FROM blueprint_presets WHERE id = ? AND blueprint_id = ?',
      [req.params.presetId, req.params.id]
    );
    res.json({ message: 'Preset removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /blueprints/:id/generate
export const generateShifts = async (req, res) => {
  try {
    const { week_start } = req.body;
    if (!week_start) return res.status(400).json({ error: 'week_start is required.' });

    // Parse as local date parts to avoid timezone issues
    const [y, m, d] = week_start.split('-').map(Number);
    const weekDate = new Date(y, m - 1, d);
    if (weekDate.getDay() !== 0) {
      return res.status(400).json({ error: 'week_start must be a Sunday.' });
    }

    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id, department_id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    const [bpShifts] = await pool.query(
      'SELECT * FROM blueprint_shifts WHERE blueprint_id = ?',
      [bp.id]
    );

    // Build override map: dateStr → array of custom shifts (empty = skip day)
    const [overrideRows] = await pool.query(
      `SELECT o.override_date, s.id as shift_id, s.title, s.start_time, s.end_time,
              s.required_staff, s.needs_shift_manager
       FROM blueprint_overrides o
       LEFT JOIN blueprint_override_shifts s ON s.override_id = o.id
       WHERE o.blueprint_id = ?`,
      [bp.id]
    );

    const overrideMap = new Map();
    for (const row of overrideRows) {
      const dateStr = toYMD(row.override_date);
      if (!overrideMap.has(dateStr)) overrideMap.set(dateStr, []);
      if (row.shift_id) {
        overrideMap.get(dateStr).push({
          title: row.title,
          start_time: row.start_time,
          end_time: row.end_time,
          required_staff: row.required_staff,
          needs_shift_manager: !!row.needs_shift_manager,
        });
      }
    }

    const insertRows = [];
    let overrideDays = 0;

    for (let i = 0; i < 7; i++) {
      const curr = new Date(y, m - 1, d + i);
      const dateStr = buildDateStr(curr.getFullYear(), curr.getMonth() + 1, curr.getDate());

      // Use override shifts if date has an override; otherwise use weekly template
      const slotsForDay = overrideMap.has(dateStr)
        ? overrideMap.get(dateStr)
        : bpShifts.filter(s => s.day_of_week === i);

      if (overrideMap.has(dateStr)) overrideDays++;

      for (const slot of slotsForDay) {
        const startDT = `${dateStr} ${slot.start_time}`;

        let endDateStr = dateStr;
        if (slot.end_time <= slot.start_time) {
          const nextDay = new Date(y, m - 1, d + i + 1);
          endDateStr = buildDateStr(nextDay.getFullYear(), nextDay.getMonth() + 1, nextDay.getDate());
        }
        const endDT = `${endDateStr} ${slot.end_time}`;

        insertRows.push([uuid(), bp.department_id, slot.title, startDT, endDT, slot.required_staff, 'draft', req.user.id]);
      }
    }

    if (insertRows.length > 0) {
      await pool.query(
        'INSERT INTO shifts (id, department_id, title, start_time, end_time, required_staff, status, created_by) VALUES ?',
        [insertRows]
      );
    }

    res.json({ created: insertRows.length, overrideDays, week_start });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
