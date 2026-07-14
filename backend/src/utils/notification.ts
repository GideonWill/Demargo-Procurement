import prisma from '../database/prisma';

export const createSystemNotification = async (
  io: any,
  message: string,
  type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'PAYMENT_OVERDUE' | 'SYSTEM'
) => {
  try {
    const notification = await prisma.notification.create({
      data: {
        message,
        type,
      },
    });

    if (io) {
      io.emit('notification:new', notification);
      io.emit('inventory:update'); // General trigger for dashboards to reload data
    }

    return notification;
  } catch (error) {
    console.error('Failed to create notification:', error);
    return null;
  }
};
