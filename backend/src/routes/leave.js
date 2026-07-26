import { Router } from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';
import { validationError } from '../utils/response.js';
import {
  getLeaveRequests,
  createLeaveRequest,
  reviewLeaveRequest,
  deleteLeaveRequest,
  restoreLeaveRequest
} from '../controllers/leaveController.js';

const router = Router();

const handleDocumentUpload = (req, res, next) => {
  upload.any()(req, res, err => {
    if (err) return validationError(res, err.message);
    next();
  });
};

router.route('/')
  .get(getLeaveRequests)
  .post(
    requireRole('employee', 'shift_manager'),
    handleDocumentUpload,
    createLeaveRequest
  );

router.patch('/:id/review', requireRole('admin', 'lead'), reviewLeaveRequest);
router.delete('/:id', requireRole('employee', 'shift_manager'), deleteLeaveRequest);
router.patch('/:id/restore', requireRole('admin'), restoreLeaveRequest);

export default router;