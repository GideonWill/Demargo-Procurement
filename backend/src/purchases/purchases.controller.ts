import { Request, Response } from 'express';
import prisma from '../database/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { createStockMovement } from '../utils/movement';
import { createAuditLog } from '../utils/audit';
import { createSystemNotification } from '../utils/notification';
import { POStatus, Role } from '@prisma/client';

// Helper to generate a unique PO number: PO-YYYYMMDD-XXXX
const generatePONumber = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = Math.floor(1000 + Math.random() * 9000).toString();
  return `PO-${dateStr}-${randomStr}`;
};

// 1. Create Purchase Order (status defaults to PENDING)
export const createPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { supplierId, items } = req.body; // items is array of { productId, quantity, unitCost }

    if (!supplierId || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: 'Supplier and a non-empty items array are required.' });
      return;
    }

    // Verify supplier exists
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      res.status(404).json({ message: 'Supplier not found' });
      return;
    }

    // Generate PO and calculate totals in a transaction
    const purchaseOrder = await prisma.$transaction(async (tx) => {
      let totalCost = 0;
      const poNumber = generatePONumber();

      // Create PO shell first
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId,
          status: POStatus.PENDING,
          totalCost: 0,
        }
      });

      // Map and create items, updating total cost
      for (const item of items) {
        const { productId, quantity, unitCost } = item;
        const qty = parseFloat(quantity);
        const cost = parseFloat(unitCost);

        if (!productId || isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
          throw new Error('Invalid product configuration in PO items list.');
        }

        const itemTotal = qty * cost;
        totalCost += itemTotal;

        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: po.id,
            productId,
            quantity: qty,
            unitCost: cost,
            totalCost: itemTotal,
          }
        });
      }

      // Update PO total cost
      return await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { totalCost },
        include: {
          items: {
            include: { product: true }
          },
          supplier: true,
        }
      });
    });

    // Audit Log
    await createAuditLog(userId, 'Created Purchase Order', {
      poId: purchaseOrder.id,
      poNumber: purchaseOrder.poNumber,
      totalCost: purchaseOrder.totalCost,
    });

    res.status(201).json(purchaseOrder);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// 2. Get All Purchase Orders
export const getPurchaseOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const pos = await prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        items: {
          include: { product: true }
        },
        payments: true,
      },
      orderBy: { date: 'desc' },
    });

    res.json(pos);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve purchase orders', error: error.message });
  }
};

// 3. Get PO by ID
export const getPurchaseOrderById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: { product: { include: { category: true } } }
        },
        payments: {
          orderBy: { paymentDate: 'desc' }
        }
      }
    });

    if (!po) {
      res.status(404).json({ message: 'Purchase order not found' });
      return;
    }

    res.json(po);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve purchase order', error: error.message });
  }
};

// 4. Approve Purchase Order (restricted to ADMIN)
export const approvePurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) {
      res.status(404).json({ message: 'Purchase order not found' });
      return;
    }

    if (po.status !== POStatus.PENDING) {
      res.status(400).json({ message: `Cannot approve PO in "${po.status}" status.` });
      return;
    }

    const updatedPO = await prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.APPROVED },
      include: { supplier: true }
    });

    // Audit Log
    await createAuditLog(userId, 'Approved Purchase Order', { poId: po.id, poNumber: po.poNumber });

    res.json(updatedPO);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to approve purchase order', error: error.message });
  }
};

// 5. Receive Stock from PO (Increments product stock, logs stock movement)
export const receivePurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: { include: { product: true } } }
    });

    if (!po) {
      res.status(404).json({ message: 'Purchase order not found' });
      return;
    }

    if (po.status !== POStatus.APPROVED) {
      res.status(400).json({ message: `Cannot receive stock for PO with status "${po.status}". Must be APPROVED.` });
      return;
    }

    // Run inventory update and status transition inside database transaction
    const receivedPO = await prisma.$transaction(async (tx) => {
      const io = req.app.get('io');

      for (const item of po.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product) {
          const restoredQty = product.quantityAvailable + item.quantity;

          // 1. Update product quantity
          await tx.product.update({
            where: { id: item.productId },
            data: { quantityAvailable: restoredQty }
          });

          // 2. Log Stock Movement
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              previousQuantity: product.quantityAvailable,
              change: item.quantity,
              newQuantity: restoredQty,
              userId,
              reason: `Received stock from Purchase Order: ${po.poNumber}`,
            }
          });
        }
      }

      // 3. Mark PO as RECEIVED
      return await tx.purchaseOrder.update({
        where: { id },
        data: { status: POStatus.RECEIVED },
        include: { supplier: true }
      });
    });

    // Trigger notification and dashboard updates
    const io = req.app.get('io');
    if (io) {
      io.emit('inventory:update');
      io.emit('notification:new', {
        id: Math.random().toString(),
        message: `Inventory updated: Received items for PO ${po.poNumber}`,
        type: 'SYSTEM',
        read: false,
        createdAt: new Date(),
      });
    }

    // Audit Log
    await createAuditLog(userId, 'Received stock for Purchase Order', { poId: po.id, poNumber: po.poNumber });

    res.json(receivedPO);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to receive stock', error: error.message });
  }
};

// 6. Cancel Purchase Order
export const cancelPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) {
      res.status(404).json({ message: 'Purchase order not found' });
      return;
    }

    // Restrict cancellation to PENDING or APPROVED
    if (po.status !== POStatus.PENDING && po.status !== POStatus.APPROVED) {
      res.status(400).json({ message: `Cannot cancel purchase order with status "${po.status}".` });
      return;
    }

    const updatedPO = await prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.CANCELLED },
      include: { supplier: true }
    });

    // Audit Log
    await createAuditLog(userId, 'Cancelled Purchase Order', { poId: po.id, poNumber: po.poNumber });

    res.json(updatedPO);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to cancel purchase order', error: error.message });
  }
};
