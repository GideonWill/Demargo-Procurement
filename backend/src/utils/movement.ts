import prisma from '../database/prisma';

export const createStockMovement = async (
  productId: string,
  previousQuantity: number,
  change: number,
  newQuantity: number,
  userId: string,
  reason: string
) => {
  try {
    return await prisma.stockMovement.create({
      data: {
        productId,
        previousQuantity,
        change,
        newQuantity,
        userId,
        reason,
      },
    });
  } catch (error) {
    console.error('Failed to create stock movement record:', error);
    throw error;
  }
};
