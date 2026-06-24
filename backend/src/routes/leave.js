import { Router } from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';
import {
  getLeaveRequests,
  createLeaveRequest,
  reviewLeaveRequest,
  deleteLeaveRequest
} from '../controllers/leaveController.js';

const router = Router();

router.route('/')
  .get(getLeaveRequests)
  .post(
    requireRole('employee', 'shift_manager'),
    upload.single('document'),
    createLeaveRequest
  );

router.patch('/:id/review', requireRole('admin', 'lead'), reviewLeaveRequest);
router.delete('/:id', requireRole('employee', 'shift_manager'), deleteLeaveRequest);

export default router;