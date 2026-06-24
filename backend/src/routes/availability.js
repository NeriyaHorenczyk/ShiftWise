import { Router } from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import {
  getAvailability,
  getTeamAvailability,
  submitAvailability,
  deleteAvailability
} from '../controllers/availabilityController.js';

const router = Router();

router.route('/')
  .get(getAvailability)
  .post(submitAvailability)
  .delete(deleteAvailability);

router.get('/team', requireRole('admin', 'lead'), getTeamAvailability);

export default router;