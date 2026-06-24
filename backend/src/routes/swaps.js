import { Router } from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import {
  getSwaps,
  createSwap,
  respondToSwap,
  approveSwap
} from '../controllers/swapController.js';

const router = Router();

router.route('/')
  .get(getSwaps)
  .post(requireRole('employee', 'shift_manager'), createSwap);

router.patch('/:id/respond', requireRole('employee', 'shift_manager'), respondToSwap);
router.patch('/:id/approve', requireRole('admin', 'lead'), approveSwap);

export default router;