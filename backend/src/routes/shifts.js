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
  // TODO: remove 'admin' from shift management routes when done testing
  .post(requireRole('admin', 'lead'), createShift);

router.get('/my', getMyShifts);

router.route('/:id')
  .get(getShiftById)
  .put(requireRole('admin', 'lead'), updateShift)
  .delete(requireRole('admin', 'lead'), deleteShift);


router.post('/:id/publish', requireRole('admin', 'lead'), publishShift);
router.post('/:id/unpublish', requireRole('admin', 'lead'), unpublishShift);
router.post('/:id/assign', requireRole('admin', 'lead'), assignEmployee);
router.delete('/:id/assign/:userId', requireRole('admin', 'lead'), unassignEmployee);

export default router;