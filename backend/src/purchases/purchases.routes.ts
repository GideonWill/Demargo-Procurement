import { Router } from 'express';
import {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  approvePurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
} from './purchases.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

// Purchase Order Routes
router.get('/', authenticateJWT, getPurchaseOrders);
router.get('/:id', authenticateJWT, getPurchaseOrderById);

router.post('/', authenticateJWT, authorizeRoles(Role.ADMIN, Role.STORE_MANAGER), createPurchaseOrder);
router.put('/:id/approve', authenticateJWT, authorizeRoles(Role.ADMIN), approvePurchaseOrder);
router.put('/:id/receive', authenticateJWT, authorizeRoles(Role.ADMIN, Role.STORE_MANAGER), receivePurchaseOrder);
router.put('/:id/cancel', authenticateJWT, authorizeRoles(Role.ADMIN, Role.STORE_MANAGER), cancelPurchaseOrder);

export default router;
