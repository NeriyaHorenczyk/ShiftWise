import pool from '../../db/connection.js';
import { v4 as uuid } from 'uuid';
import { success, created, updated, deleted, noData, notFound, conflict, validationError, serverError } from '../utils/response.js';
import { withTransaction } from '../utils/transaction.js';
import { emitScheduleUpdated } from '../services/socketService.js';

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
    if (!deptId) return validationError(res, 'You are not assigned to a department.');

    const [[blueprint]] = await pool.query(
      'SELECT * FROM shift_blueprints WHERE department_id = ?',
      [deptId]
    );

    if (!blueprint) return noData(res, 'No blueprint configured for this department.');

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

    success(res, {
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
    serverError(res, err.message);
  }
};

// POST /blueprints
export const createBlueprint = async (req, res) => {
  try {
    const deptId = await getUserDeptId(req.user.id);
    if (!deptId) return validationError(res, 'You are not assigned to a department.');

    const { name = 'Standard Week' } = req.body;
    const id = uuid();
    try {
      await pool.query(
        'INSERT INTO shift_blueprints (id, department_id, name, created_by) VALUES (?, ?, ?, ?)',
        [id, deptId, name.trim(), req.user.id]
      );
    } catch (err) {
      if (err.errno === 1062) return conflict(res, 'A blueprint already exists for this department.');
      throw err;
    }

    created(res, { id, department_id: deptId, name: name.trim(), shifts: [], presets: [], overrides: [] }, 'Blueprint created.');
  } catch (err) {
    serverError(res, err.message);
  }
};

// PUT /blueprints/:id
export const updateBlueprint = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return validationError(res, 'Name is required.');
    const deptId = await getUserDeptId(req.user.id);
    await pool.query(
      'UPDATE shift_blueprints SET name = ? WHERE id = ? AND department_id = ?',
      [name.trim(), req.params.id, deptId]
    );
    updated(res, null, 'Blueprint updated.');
  } catch (err) {
    serverError(res, err.message);
  }
};

// POST /blueprints/:id/shifts
export const addBlueprintShift = async (req, res) => {
  try {
    const { day_of_week, title, start_time, end_time, required_staff = 1, needs_shift_manager = false } = req.body;

    if (day_of_week === undefined || day_of_week === null || !title?.trim() || !start_time || !end_time) {
      return validationError(res, 'day_of_week, title, start_time, and end_time are required.');
    }

    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return notFound(res, 'Blueprint not found.');

    const id = uuid();
    await pool.query(
      `INSERT INTO blueprint_shifts
       (id, blueprint_id, day_of_week, title, start_time, end_time, required_staff, needs_shift_manager)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, day_of_week, title.trim(), start_time, end_time, required_staff, needs_shift_manager ? 1 : 0]
    );

    created(res, {
      id, blueprint_id: req.params.id, day_of_week, title: title.trim(),
      start_time, end_time, required_staff, needs_shift_manager: !!needs_shift_manager,
    }, 'Shift slot added.');
  } catch (err) {
    serverError(res, err.message);
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
    if (!bp) return notFound(res, 'Blueprint not found.');

    await pool.query('DELETE FROM blueprint_shifts WHERE id = ? AND blueprint_id = ?', [req.params.slotId, req.params.id]);
    deleted(res, 'Shift slot removed.');
  } catch (err) {
    serverError(res, err.message);
  }
};

// POST /blueprints/:id/overrides
export const addBlueprintOverride = async (req, res) => {
  try {
    const { override_date, label } = req.body;
    if (!override_date || !label?.trim()) {
      return validationError(res, 'override_date and label are required.');
    }

    // Compare as plain YYYY-MM-DD strings (both already date-only, no time
    // component) so this can't be thrown off by timezone conversion —
    // toYMD() below builds "today" from local date parts for the same reason.
    if (override_date < toYMD(new Date())) {
      return validationError(res, 'Cannot create or modify date overrides for past dates.');
    }

    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return notFound(res, 'Blueprint not found.');

    const id = uuid();
    try {
      await pool.query(
        'INSERT INTO blueprint_overrides (id, blueprint_id, override_date, label) VALUES (?, ?, ?, ?)',
        [id, req.params.id, override_date, label.trim()]
      );
    } catch (err) {
      if (err.errno === 1062) return conflict(res, 'An override already exists for this date.');
      throw err;
    }

    created(res, { id, blueprint_id: req.params.id, override_date, label: label.trim(), shifts: [] }, 'Override added.');
  } catch (err) {
    serverError(res, err.message);
  }
};

// POST /blueprints/:id/overrides/:ovId/shifts
export const addOverrideShift = async (req, res) => {
  try {
    const { title, start_time, end_time, required_staff = 1, needs_shift_manager = false } = req.body;
    if (!title?.trim() || !start_time || !end_time) {
      return validationError(res, 'title, start_time, and end_time are required.');
    }

    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return notFound(res, 'Blueprint not found.');

    const [[ov]] = await pool.query(
      'SELECT id FROM blueprint_overrides WHERE id = ? AND blueprint_id = ?',
      [req.params.ovId, req.params.id]
    );
    if (!ov) return notFound(res, 'Override not found.');

    const id = uuid();
    await pool.query(
      `INSERT INTO blueprint_override_shifts
       (id, override_id, title, start_time, end_time, required_staff, needs_shift_manager)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.ovId, title.trim(), start_time, end_time, required_staff, needs_shift_manager ? 1 : 0]
    );

    created(res, {
      id, override_id: req.params.ovId,
      title: title.trim(), start_time, end_time, required_staff,
      needs_shift_manager: !!needs_shift_manager,
    }, 'Override shift added.');
  } catch (err) {
    serverError(res, err.message);
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
    if (!bp) return notFound(res, 'Blueprint not found.');

    await pool.query(
      'DELETE FROM blueprint_override_shifts WHERE id = ? AND override_id = ?',
      [req.params.shiftId, req.params.ovId]
    );
    deleted(res, 'Override shift removed.');
  } catch (err) {
    serverError(res, err.message);
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
    if (!bp) return notFound(res, 'Blueprint not found.');

    await pool.query('DELETE FROM blueprint_overrides WHERE id = ? AND blueprint_id = ?', [req.params.ovId, req.params.id]);
    deleted(res, 'Override removed.');
  } catch (err) {
    serverError(res, err.message);
  }
};

// POST /blueprints/:id/presets
export const addPreset = async (req, res) => {
  try {
    const { title, start_time, end_time, required_staff = 1, needs_shift_manager = false } = req.body;
    if (!title?.trim() || !start_time || !end_time) {
      return validationError(res, 'title, start_time, and end_time are required.');
    }
    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return notFound(res, 'Blueprint not found.');

    const id = uuid();
    await pool.query(
      `INSERT INTO blueprint_presets
       (id, blueprint_id, title, start_time, end_time, required_staff, needs_shift_manager)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, title.trim(), start_time, end_time, required_staff, needs_shift_manager ? 1 : 0]
    );
    created(res, { id, blueprint_id: req.params.id, title: title.trim(), start_time, end_time, required_staff, needs_shift_manager: !!needs_shift_manager }, 'Preset added.');
  } catch (err) {
    serverError(res, err.message);
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
    if (!bp) return notFound(res, 'Blueprint not found.');
    await pool.query(
      'DELETE FROM blueprint_presets WHERE id = ? AND blueprint_id = ?',
      [req.params.presetId, req.params.id]
    );
    deleted(res, 'Preset removed.');
  } catch (err) {
    serverError(res, err.message);
  }
};

// Named snapshots of the ENTIRE weekly template grid (all 7 days' shift
// slots) — distinct from blueprint_presets, which is a single reusable
// shift slot offered as a shortcut inside the "add shift" modals.

// GET /blueprints/:id/templates
export const listWeeklyTemplates = async (req, res) => {
  try {
    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return notFound(res, 'Blueprint not found.');

    const [templates] = await pool.query(
      `SELECT t.id, t.name, t.created_at, COUNT(s.id) AS shift_count
       FROM weekly_templates t
       LEFT JOIN weekly_template_shifts s ON s.template_id = t.id
       WHERE t.blueprint_id = ?
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
      [req.params.id]
    );
    if (templates.length === 0) return noData(res, 'No saved weekly templates.', templates);
    success(res, templates);
  } catch (err) {
    serverError(res, err.message);
  }
};

// POST /blueprints/:id/templates — snapshot the CURRENT weekly template
// grid (blueprint_shifts) into a new named, standalone copy.
export const saveWeeklyTemplate = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return validationError(res, 'name is required.');

    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return notFound(res, 'Blueprint not found.');

    const [currentShifts] = await pool.query(
      `SELECT day_of_week, title, start_time, end_time, required_staff, needs_shift_manager
       FROM blueprint_shifts WHERE blueprint_id = ?`,
      [req.params.id]
    );

    const templateId = uuid();
    try {
      await pool.query(
        'INSERT INTO weekly_templates (id, blueprint_id, name, created_by) VALUES (?, ?, ?, ?)',
        [templateId, req.params.id, name.trim(), req.user.id]
      );
    } catch (err) {
      if (err.errno === 1062) return conflict(res, 'A template with this name already exists.');
      throw err;
    }

    if (currentShifts.length > 0) {
      const rows = currentShifts.map(s => [
        uuid(), templateId, s.day_of_week, s.title, s.start_time, s.end_time,
        s.required_staff, s.needs_shift_manager ? 1 : 0,
      ]);
      await pool.query(
        `INSERT INTO weekly_template_shifts
         (id, template_id, day_of_week, title, start_time, end_time, required_staff, needs_shift_manager)
         VALUES ?`,
        [rows]
      );
    }

    created(res, { id: templateId, name: name.trim(), shift_count: currentShifts.length }, 'Weekly template saved.');
  } catch (err) {
    serverError(res, err.message);
  }
};

// POST /blueprints/:id/templates/:templateId/apply — replace the CURRENT
// weekly template grid with a fresh copy of the saved template's shifts.
export const applyWeeklyTemplate = async (req, res) => {
  try {
    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return notFound(res, 'Blueprint not found.');

    const [[template]] = await pool.query(
      'SELECT id FROM weekly_templates WHERE id = ? AND blueprint_id = ?',
      [req.params.templateId, req.params.id]
    );
    if (!template) return notFound(res, 'Weekly template not found.');

    const [templateShifts] = await pool.query(
      `SELECT day_of_week, title, start_time, end_time, required_staff, needs_shift_manager
       FROM weekly_template_shifts WHERE template_id = ?`,
      [req.params.templateId]
    );

    // Swapping out the whole grid must be all-or-nothing — a failure
    // partway through would otherwise leave the department with a blank
    // template until the next fix, since the old slots are already gone.
    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM blueprint_shifts WHERE blueprint_id = ?', [req.params.id]);
      if (templateShifts.length > 0) {
        const rows = templateShifts.map(s => [
          uuid(), req.params.id, s.day_of_week, s.title, s.start_time, s.end_time,
          s.required_staff, s.needs_shift_manager ? 1 : 0,
        ]);
        await conn.query(
          `INSERT INTO blueprint_shifts
           (id, blueprint_id, day_of_week, title, start_time, end_time, required_staff, needs_shift_manager)
           VALUES ?`,
          [rows]
        );
      }
    });

    success(res, { applied: templateShifts.length }, 'Weekly template applied.');
  } catch (err) {
    serverError(res, err.message);
  }
};

// DELETE /blueprints/:id/templates/:templateId
export const deleteWeeklyTemplate = async (req, res) => {
  try {
    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return notFound(res, 'Blueprint not found.');

    await pool.query(
      'DELETE FROM weekly_templates WHERE id = ? AND blueprint_id = ?',
      [req.params.templateId, req.params.id]
    );
    deleted(res, 'Weekly template deleted.');
  } catch (err) {
    serverError(res, err.message);
  }
};

// POST /blueprints/:id/generate
export const generateShifts = async (req, res) => {
  try {
    const { week_start } = req.body;
    if (!week_start) return validationError(res, 'week_start is required.');

    // Parse as local date parts to avoid timezone issues
    const [y, m, d] = week_start.split('-').map(Number);
    const weekDate = new Date(y, m - 1, d);
    if (weekDate.getDay() !== 0) {
      return validationError(res, 'week_start must be a Sunday.');
    }

    const deptId = await getUserDeptId(req.user.id);
    const [[bp]] = await pool.query(
      'SELECT id, department_id FROM shift_blueprints WHERE id = ? AND department_id = ?',
      [req.params.id, deptId]
    );
    if (!bp) return notFound(res, 'Blueprint not found.');

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

        // Every real shift requires a shift manager regardless of what the
        // originating blueprint slot/preset was set to — same invariant
        // shiftController.createShift enforces for manually created shifts.
        insertRows.push([
          uuid(), bp.department_id, slot.title, startDT, endDT,
          slot.required_staff, 1, 'draft', req.user.id,
        ]);
      }
    }

    if (insertRows.length > 0) {
      await pool.query(
        `INSERT INTO shifts
         (id, department_id, title, start_time, end_time, required_staff, needs_shift_manager, status, created_by)
         VALUES ?`,
        [insertRows]
      );
      // Generating a batch of draft shifts is functionally the same as a
      // bulk create — anyone viewing this department's schedule needs the
      // same live-update a single createShift would trigger.
      emitScheduleUpdated(bp.department_id, { reason: 'blueprint-generated', count: insertRows.length });
    }

    success(res, { created: insertRows.length, overrideDays, week_start }, 'Shifts generated.');
  } catch (err) {
    serverError(res, err.message);
  }
};
