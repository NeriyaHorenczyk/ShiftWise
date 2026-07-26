import { Router } from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import {
  getAllShifts,
  getShiftById,
  getMyShifts,
  createShift,
  updateShift,
  deleteShift,
  restoreShift,
  publishShift,
  unpublishShift,
  assignEmployee,
  unassignEmployee,
  updateShiftAssignments,
  bulkClear,
  bulkPublish,
  bulkUnpublish,
  autoAssign,
} from '../controllers/shiftController.js';

const router = Router();

router.route('/')
  .get(getAllShifts)
  .post(requireRole('lead'), createShift);

router.get('/my', getMyShifts);
router.post('/bulk/clear', requireRole('lead'), bulkClear);
router.post('/bulk/publish', requireRole('lead'), bulkPublish);
router.post('/bulk/unpublish', requireRole('lead'), bulkUnpublish);
router.post('/auto-assign', requireRole('lead'), autoAssign);

router.route('/:id')
  .get(getShiftById)
  .put(requireRole('lead'), updateShift)
  .delete(requireRole('lead'), deleteShift);

router.patch('/:id/restore', requireRole('admin'), restoreShift);
router.post('/:id/publish', requireRole('lead'), publishShift);
router.post('/:id/unpublish', requireRole('lead'), unpublishShift);
router.post('/:id/assign', requireRole('lead'), assignEmployee);
router.delete('/:id/assign/:userId', requireRole('lead'), unassignEmployee);
router.put('/:id/assignments', requireRole('lead'), updateShiftAssignments);

export default router;