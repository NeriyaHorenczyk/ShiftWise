import { Router } from 'express';
import { getScheduleOverview } from '../controllers/scheduleController.js';

const router = Router();

router.get('/overview', getScheduleOverview);

export default router;
