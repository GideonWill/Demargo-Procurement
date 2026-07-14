import { Router } from 'express';
import {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  allocateMaterials,
  consumeMaterials,
  deleteProject,
} from './projects.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

// Project Management Routes
router.get('/', authenticateJWT, getProjects);
router.get('/:id', authenticateJWT, getProjectById);

router.post('/', authenticateJWT, authorizeRoles(Role.ADMIN, Role.STORE_MANAGER), createProject);
router.put('/:id', authenticateJWT, authorizeRoles(Role.ADMIN, Role.STORE_MANAGER), updateProject);
router.delete('/:id', authenticateJWT, authorizeRoles(Role.ADMIN), deleteProject);

// Allocation & Consumption
router.post('/:id/allocate', authenticateJWT, authorizeRoles(Role.ADMIN, Role.STORE_MANAGER), allocateMaterials);
router.post('/:id/consume', authenticateJWT, authorizeRoles(Role.ADMIN, Role.STORE_MANAGER), consumeMaterials);

export default router;
