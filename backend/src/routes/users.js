import { Router } from 'express';
import { requireRole, requireSelfOrAdmin } from '../middleware/auth.middleware.js';
import {
  getAllUsers,
  getUserById,
  updateUser,
  updateUserRole,
  deleteUser
} from '../controllers/usersController.js';

const router = Router();

router.get('/', requireRole('admin', 'lead'), getAllUsers);
router.route('/:id')
  .get(getUserById)
  .put(requireSelfOrAdmin, updateUser)
  .delete(requireRole('admin'), deleteUser);
router.patch('/:id/role', requireRole('admin'), updateUserRole);

export default router;