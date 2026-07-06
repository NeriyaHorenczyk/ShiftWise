import { Router } from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import {
  getBlueprint,
  createBlueprint,
  updateBlueprint,
  addBlueprintShift,
  removeBlueprintShift,
  addBlueprintOverride,
  removeBlueprintOverride,
  addOverrideShift,
  removeOverrideShift,
  addPreset,
  removePreset,
  generateShifts,
} from '../controllers/blueprintController.js';

const router = Router();

router.get('/', requireRole('lead'), getBlueprint);
router.post('/', requireRole('lead'), createBlueprint);
router.put('/:id', requireRole('lead'), updateBlueprint);

router.post('/:id/shifts', requireRole('lead'), addBlueprintShift);
router.delete('/:id/shifts/:slotId', requireRole('lead'), removeBlueprintShift);

router.post('/:id/overrides', requireRole('lead'), addBlueprintOverride);
router.delete('/:id/overrides/:ovId', requireRole('lead'), removeBlueprintOverride);
router.post('/:id/overrides/:ovId/shifts', requireRole('lead'), addOverrideShift);
router.delete('/:id/overrides/:ovId/shifts/:shiftId', requireRole('lead'), removeOverrideShift);

router.post('/:id/presets', requireRole('lead'), addPreset);
router.delete('/:id/presets/:presetId', requireRole('lead'), removePreset);

router.post('/:id/generate', requireRole('lead'), generateShifts);

export default router;
