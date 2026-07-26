import { Router } from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import {
  getSwaps,
  createSwap,
  respondToSwap,
  approveSwap,
  deleteSwap,
  restoreSwap
} from '../controllers/swapController.js';

const router = Router();

router.route('/')
  .get(getSwaps)
  .post(requireRole('employee', 'shift_manager'), createSwap);

router.patch('/:id/respond', requireRole('employee', 'shift_manager'), respondToSwap);
router.patch('/:id/approve', requireRole('admin', 'lead'), approveSwap);
router.delete('/:id', requireRole('employee', 'shift_manager'), deleteSwap);
router.patch('/:id/restore', requireRole('admin'), restoreSwap);

export default router;