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

const handleDocumentUpload = (req, res, next) => {
  upload.any()(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
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

export default router;