import { Request, Response } from 'express';
import prisma from '../database/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { createAuditLog } from '../utils/audit';
import { createSystemNotification } from '../utils/notification';
import { POStatus, PaymentMethod, PaymentStatus } from '@prisma/client';

// Helper to generate a unique Invoice number if not provided: INV-YYYYMMDD-XXXX
const generateInvoiceNumber = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = Math.floor(1000 + Math.random() * 9000).toString();
  return `INV-${dateStr}-${randomStr}`;
};

// 1. Record Supplier Payment
export const recordPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const {
      invoiceNumber,
      purchaseOrderId,
      supplierId,
      amountPaid,
      paymentMethod,
      notes,
    } = req.body;

    if (!purchaseOrderId || !supplierId || amountPaid === undefined || !paymentMethod) {
      res.status(400).json({ message: 'Purchase Order ID, Supplier ID, amount paid, and payment method are required.' });
      return;
    }

    const amt = parseFloat(amountPaid);
    if (isNaN(amt) || amt <= 0) {
      res.status(400).json({ message: 'Amount paid must be a positive number.' });
      return;
    }

    // Run within database transaction
    const payment = await prisma.$transaction(async (tx) => {
      // 1. Fetch Purchase Order
      const po = await tx.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: { payments: true }
      });

      if (!po) {
        throw new Error('Purchase order not found.');
      }

      if (po.status === POStatus.PENDING || po.status === POStatus.CANCELLED) {
        throw new Error(`Cannot pay for a Purchase Order with status "${po.status}".`);
      }

      // 2. Validate remaining balance
      const totalCost = po.totalCost;
      const totalPaidAlready = po.payments.reduce((sum, p) => sum + p.amountPaid, 0);
      const remainingBalance = Math.max(0, totalCost - totalPaidAlready);

      if (amt > remainingBalance) {
        throw new Error(`Payment amount (GHS ${amt}) exceeds remaining balance (GHS ${remainingBalance}).`);
      }

      // 3. Create Payment Record
      const invNum = invoiceNumber || generateInvoiceNumber();

      const isFullyPaid = amt === remainingBalance;
      const paymentStatus = isFullyPaid ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;

      const pRecord = await tx.payment.create({
        data: {
          invoiceNumber: invNum,
          purchaseOrderId,
          supplierId,
          amountPaid: amt,
          paymentMethod: paymentMethod as PaymentMethod,
          status: paymentStatus,
          notes,
        },
        include: {
          supplier: true,
          purchaseOrder: true,
        }
      });

      // 4. Update PO Status to PAID if fully paid
      if (isFullyPaid) {
        await tx.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: { status: POStatus.PAID }
        });
      }

      return pRecord;
    });

    // Trigger Notification & Real-time Update
    const io = req.app.get('io');
    if (io) {
      io.emit('payment:recorded');
      await createSystemNotification(
        io,
        `Recorded payment of GHS ${payment.amountPaid} to ${payment.supplier.name} for PO ${payment.purchaseOrder.poNumber}`,
        'SYSTEM'
      );
    }

    // Audit Log
    await createAuditLog(userId, 'Recorded Supplier Payment', {
      paymentId: payment.id,
      invoiceNumber: payment.invoiceNumber,
      amountPaid: payment.amountPaid,
      supplierName: payment.supplier.name,
      poNumber: payment.purchaseOrder.poNumber,
    });

    res.status(201).json(payment);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// 2. Get All Payments
export const getPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        supplier: true,
        purchaseOrder: true,
      },
      orderBy: { paymentDate: 'desc' },
    });

    res.json(payments);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve payments ledger', error: error.message });
  }
};

// 3. Get Payment by ID
export const getPaymentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        supplier: true,
        purchaseOrder: true,
      }
    });

    if (!payment) {
      res.status(404).json({ message: 'Payment record not found' });
      return;
    }

    res.json(payment);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve payment record details', error: error.message });
  }
};
