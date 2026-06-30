import { Router } from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import {
  getAllShifts,
  getShiftById,
  getMyShifts,
  createShift,
  updateShift,
  deleteShift,
  publishShift,
  unpublishShift,
  assignEmployee,
  unassignEmployee
} from '../controllers/shiftController.js';

const router = Router();

router.route('/')
  .get(getAllShifts)
  .post(requireRole('lead'), createShift);

router.get('/my', getMyShifts);

router.route('/:id')
  .get(getShiftById)
  .put(requireRole('lead'), updateShift)
  .delete(requireRole('lead'), deleteShift);

router.post('/:id/publish', requireRole('lead'), publishShift);
router.post('/:id/unpublish', requireRole('lead'), unpublishShift);
router.post('/:id/assign', requireRole('lead'), assignEmployee);
router.delete('/:id/assign/:userId', requireRole('lead'), unassignEmployee);

export default router;