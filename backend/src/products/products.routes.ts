import { Router } from 'express';
import {
  getCategories,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
} from './products.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

// Category Listing
router.get('/categories', getCategories);

// Product CRUD Endpoints
router.get('/', getProducts);
router.get('/:id', getProductById);

router.post('/', authenticateJWT, authorizeRoles(Role.ADMIN, Role.STORE_MANAGER), createProduct);
router.put('/:id', authenticateJWT, authorizeRoles(Role.ADMIN, Role.STORE_MANAGER), updateProduct);
router.delete('/:id', authenticateJWT, authorizeRoles(Role.ADMIN), deleteProduct);

export default router;
