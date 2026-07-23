import { Router } from 'express';
import { requireRole, requireSelfOrAdmin } from '../middleware/auth.middleware.js';
import { uploadImage } from '../middleware/upload.middleware.js';
import { validationError } from '../utils/response.js';
import {
  getAllUsers,
  getUserById,
  updateUser,
  updateUserRole,
  uploadAvatar,
  deleteUser
} from '../controllers/usersController.js';

const router = Router();

const handleAvatarUpload = (req, res, next) => {
  uploadImage.single('avatar')(req, res, err => {
    if (err) return validationError(res, err.message);
    next();
  });
};

router.get('/', getAllUsers);
router.route('/:id')
  .get(getUserById)
  .put(requireSelfOrAdmin, updateUser)
  .delete(requireRole('admin'), deleteUser);
router.patch('/:id/role', requireRole('admin', 'lead'), updateUserRole);
router.post('/:id/avatar', requireSelfOrAdmin, handleAvatarUpload, uploadAvatar);

export default router;