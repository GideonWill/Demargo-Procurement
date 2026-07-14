import { Router } from 'express';
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from './suppliers.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

// Supplier endpoints
router.get('/', authenticateJWT, getSuppliers);
router.get('/:id', authenticateJWT, getSupplierById);

router.post('/', authenticateJWT, authorizeRoles(Role.ADMIN, Role.STORE_MANAGER), createSupplier);
router.put('/:id', authenticateJWT, authorizeRoles(Role.ADMIN, Role.STORE_MANAGER), updateSupplier);
router.delete('/:id', authenticateJWT, authorizeRoles(Role.ADMIN), deleteSupplier);

export default router;
