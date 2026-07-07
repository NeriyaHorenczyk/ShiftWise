import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail, swapApprovedEmail } from '../utils/email.js';

export const getSwaps = async (req, res) => {
  try {
    let query = `
      SELECT 
        sr.id, sr.status, sr.lead_comment, sr.created_at,
        requester.name AS requester_name,
        requester.username AS requester_username,
        target.name AS target_name,
        target.username AS target_username,
        s.title AS shift_title,
        s.start_time, s.end_time
      FROM swap_requests sr
      JOIN users requester ON sr.requester_id = requester.id
      JOIN users target ON sr.target_id = target.id
      JOIN shifts s ON sr.shift_id = s.id
    `;

    const conditions = [];
    const params = [];

    // employees only see swaps they are involved in
    if (['employee', 'shift_manager'].includes(req.user.role)) {
      conditions.push('(sr.requester_id = ? OR sr.target_id = ?)');
      params.push(req.user.id, req.user.id);
    }

    // leads only see swaps in their department
    if (req.user.role === 'lead') {
      const [depts] = await pool.query(
        'SELECT id FROM departments WHERE lead_id = ?',
        [req.user.id]
      );
      if (depts.length > 0) {
        conditions.push('s.department_id = ?');
        params.push(depts[0].id);
      }
    }

    if (conditions.length > 0)
      query += ' WHERE ' + conditions.join(' AND ');

    query += ' ORDER BY sr.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createSwap = async (req, res) => {
  try {
    const { target_id, shift_id } = req.body;

    if (!target_id || !shift_id)
      return res.status(400).json({ error: 'target_id and shift_id are required.' });

    if (target_id === req.user.id)
      return res.status(400).json({ error: 'You cannot request a swap with yourself.' });

    // verify the shift exists and is published
    const [shifts] = await pool.query(
      'SELECT * FROM shifts WHERE id = ?',
      [shift_id]
    );
    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });
    if (shifts[0].status !== 'published')
      return res.status(400).json({ error: 'You can only swap published shifts.' });

    // verify requester is actually assigned to this shift
    const [assignment] = await pool.query(
      'SELECT id FROM shift_assignments WHERE shift_id = ? AND user_id = ?',
      [shift_id, req.user.id]
    );
    if (assignment.length === 0)
      return res.status(403).json({ error: 'You are not assigned to this shift.' });

    // verify target exists and is in the same department
    const [targets] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [target_id]
    );
    if (targets.length === 0)
      return res.status(404).json({ error: 'Target user not found.' });
    if (targets[0].department_id !== shifts[0].department_id)
      return res.status(400).json({ error: 'You can only swap with employees in the same department.' });

    // if requester is acting as shift manager in this shift,
    // target must also be a shift_manager
    const [requesterAssignment] = await pool.query(
      'SELECT is_shift_manager FROM shift_assignments WHERE shift_id = ? AND user_id = ?',
      [shift_id, req.user.id]
    );

    if (requesterAssignment[0].is_shift_manager && targets[0].role !== 'shift_manager')
      return res.status(400).json({ error: 'You are acting as shift manager in this shift. You can only swap with another shift manager.' });

    // check no pending swap already exists for this shift by this requester
    const [existing] = await pool.query(
      `SELECT id FROM swap_requests 
       WHERE shift_id = ? AND requester_id = ? AND status = 'pending'`,
      [shift_id, req.user.id]
    );
    if (existing.length > 0)
      return res.status(409).json({ error: 'You already have a pending swap request for this shift.' });

    const id = uuidv4();
    await pool.query(
      `INSERT INTO swap_requests (id, requester_id, target_id, shift_id)
       VALUES (?, ?, ?, ?)`,
      [id, req.user.id, target_id, shift_id]
    );

    res.status(201).json({ message: 'Swap request created successfully.', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const respondToSwap = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'accept' or 'reject'

    if (!['accept', 'reject'].includes(action))
      return res.status(400).json({ error: 'action must be accept or reject.' });

    const [swaps] = await pool.query(
      'SELECT * FROM swap_requests WHERE id = ?',
      [id]
    );
    if (swaps.length === 0)
      return res.status(404).json({ error: 'Swap request not found.' });

    const swap = swaps[0];

    // only the target employee can respond
    if (swap.target_id !== req.user.id)
      return res.status(403).json({ error: 'Only the target employee can respond to this request.' });

    if (swap.status !== 'pending')
      return res.status(400).json({ error: 'This swap request is no longer pending.' });

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    await pool.query(
      'UPDATE swap_requests SET status = ? WHERE id = ?',
      [newStatus, id]
    );

    res.json({ message: `Swap request ${newStatus}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const approveSwap = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, lead_comment } = req.body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ error: 'action must be approve or reject.' });

    const [swaps] = await pool.query(
      'SELECT * FROM swap_requests WHERE id = ?',
      [id]
    );
    if (swaps.length === 0)
      return res.status(404).json({ error: 'Swap request not found.' });

    const swap = swaps[0];

    if (swap.status !== 'accepted')
      return res.status(400).json({ error: 'You can only approve a swap that has been accepted by both employees.' });

    if (action === 'approve') {
      // execute the swap — remove requester, add target
      await pool.query(
        'DELETE FROM shift_assignments WHERE shift_id = ? AND user_id = ?',
        [swap.shift_id, swap.requester_id]
      );
      await pool.query(
        'INSERT INTO shift_assignments (id, shift_id, user_id) VALUES (?, ?, ?)',
        [uuidv4(), swap.shift_id, swap.target_id]
      );
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pool.query(
      'UPDATE swap_requests SET status = ?, lead_comment = ? WHERE id = ?',
      [newStatus, lead_comment || null, id]
    );

    if (action === 'approve') {
      const [[shiftInfo]] = await pool.query(
        'SELECT title, start_time, end_time FROM shifts WHERE id = ?',
        [swap.shift_id]
      );
      const [[requester]] = await pool.query(
        'SELECT email, name FROM users WHERE id = ?',
        [swap.requester_id]
      );
      const [[target]] = await pool.query(
        'SELECT email, name FROM users WHERE id = ?',
        [swap.target_id]
      );
      await Promise.all([
        sendEmail(requester.email, `Swap approved — ${shiftInfo.title}`, swapApprovedEmail(requester.name, true, shiftInfo, target.name)),
        sendEmail(target.email, `Swap approved — ${shiftInfo.title}`, swapApprovedEmail(target.name, false, shiftInfo, requester.name)),
      ]);
    }

    res.json({ message: `Swap request ${newStatus}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};