import prisma from '../database/prisma';

export const createAuditLog = async (userId: string, action: string, details: object): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        details: JSON.stringify(details),
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
};
