import { Router } from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from './notifications.controller';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

// Notification management endpoints
router.get('/', authenticateJWT, getNotifications);
router.put('/read-all', authenticateJWT, markAllAsRead);
router.put('/:id/read', authenticateJWT, markAsRead);

export default router;
