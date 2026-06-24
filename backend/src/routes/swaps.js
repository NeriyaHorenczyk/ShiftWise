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
  .post(requireRole('employee'), createSwap);

router.patch('/:id/respond', requireRole('employee'), respondToSwap);
router.patch('/:id/approve', requireRole('admin', 'lead'), approveSwap);

export default router;