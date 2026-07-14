import { Request, Response } from 'express';
import prisma from '../database/prisma';

// 1. Get All Notifications
export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit to recent 50
    });
    res.json(notifications);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve notifications', error: error.message });
  }
};

// 2. Mark Notification as Read
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);

    const notification = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    res.json(notification);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to mark notification as read', error: error.message });
  }
};

// 3. Mark All as Read
export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.notification.updateMany({
      where: { read: false },
      data: { read: true },
    });

    res.json({ message: 'All notifications marked as read' });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to clear notifications', error: error.message });
  }
};
