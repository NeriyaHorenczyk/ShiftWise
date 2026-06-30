import { Router } from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import { getShiftCoverage, getEmployeeStats, getLeaveReport } from '../controllers/reportsController.js';

const router = Router();

router.get('/shifts', requireRole('lead', 'admin'), getShiftCoverage);
router.get('/employees', requireRole('lead', 'admin'), getEmployeeStats);
router.get('/leave', requireRole('lead', 'admin'), getLeaveReport);

export default router;
