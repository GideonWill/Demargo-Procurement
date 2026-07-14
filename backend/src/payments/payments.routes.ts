import { Router } from 'express';
import {
  recordPayment,
  getPayments,
  getPaymentById,
} from './payments.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

// Payment management endpoints
router.get('/', authenticateJWT, getPayments);
router.get('/:id', authenticateJWT, getPaymentById);

router.post('/', authenticateJWT, authorizeRoles(Role.ADMIN, Role.FINANCE_OFFICER), recordPayment);

export default router;
