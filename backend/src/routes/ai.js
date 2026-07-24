import { Router } from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import { chat, auditSchedule, refineLeaveRequest } from '../controllers/aiController.js';

const router = Router();

// authenticate is already applied globally in app.js before this router is
// mounted, same as every other protected router — no need to repeat it here.
router.post('/chat', requireRole('lead', 'admin'), chat);
router.post('/audit', requireRole('lead', 'admin'), auditSchedule);
router.post('/refine-request', requireRole('employee', 'shift_manager'), refineLeaveRequest);

export default router;
