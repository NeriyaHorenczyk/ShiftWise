import { Router } from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import {
  getAllDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  restoreDepartment
} from '../controllers/departmentController.js';

const router = Router();

router.route('/')
  .get(getAllDepartments)
  .post(requireRole('admin'), createDepartment);

router.route('/:id')
  .get(getDepartmentById)
  .put(requireRole('admin', 'lead'), updateDepartment)
  .delete(requireRole('admin'), deleteDepartment);

router.patch('/:id/restore', requireRole('admin'), restoreDepartment);

export default router;