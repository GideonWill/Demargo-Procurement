import { Request, Response } from 'express';
import prisma from '../database/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { createAuditLog } from '../utils/audit';

// 1. Create Supplier
export const createSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { name, companyName, phone, email, address } = req.body;

    if (!name || !companyName || !phone || !email || !address) {
      res.status(400).json({ message: 'All supplier fields are required (name, companyName, phone, email, address)' });
      return;
    }

    const existingSupplier = await prisma.supplier.findUnique({ where: { email } });
    if (existingSupplier) {
      res.status(400).json({ message: 'Supplier with this email already exists' });
      return;
    }

    const supplier = await prisma.supplier.create({
      data: { name, companyName, phone, email, address },
    });

    // Audit Log
    await createAuditLog(userId, 'Created supplier', { supplierId: supplier.id, supplierName: supplier.name });

    res.status(201).json(supplier);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to create supplier', error: error.message });
  }
};

// 2. Get All Suppliers with computed totals
export const getSuppliers = async (req: Request, res: Response): Promise<void> => {
  try {
    const suppliers = await prisma.supplier.findMany({
      include: {
        products: {
          select: { name: true }
        },
        purchaseOrders: {
          where: {
            status: { in: ['APPROVED', 'RECEIVED', 'PAID'] }
          },
          select: { totalCost: true }
        },
        payments: {
          select: { amountPaid: true }
        }
      },
      orderBy: { name: 'asc' },
    });

    // Compute dynamic totals for each supplier
    const suppliersWithTotals = suppliers.map((supplier) => {
      const totalPurchases = supplier.purchaseOrders.reduce((sum, po) => sum + po.totalCost, 0);
      const totalPaid = supplier.payments.reduce((sum, p) => sum + p.amountPaid, 0);
      const outstandingBalance = Math.max(0, totalPurchases - totalPaid);

      return {
        id: supplier.id,
        name: supplier.name,
        companyName: supplier.companyName,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        productsSuppliedCount: supplier.products.length,
        productsList: supplier.products.map(p => p.name),
        totalPurchases,
        totalPaid,
        outstandingBalance,
        createdAt: supplier.createdAt,
      };
    });

    res.json(suppliersWithTotals);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve suppliers', error: error.message });
  }
};

// 3. Get Single Supplier profile (tab details: purchase history, payment history, outstanding invoices, products supplied)
export const getSupplierById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        products: {
          include: { category: true }
        },
        purchaseOrders: {
          orderBy: { date: 'desc' }
        },
        payments: {
          orderBy: { paymentDate: 'desc' }
        }
      }
    });

    if (!supplier) {
      res.status(404).json({ message: 'Supplier not found' });
      return;
    }

    // Compute dynamic totals
    const approvedPO = supplier.purchaseOrders.filter(po => ['APPROVED', 'RECEIVED', 'PAID'].includes(po.status));
    const totalPurchases = approvedPO.reduce((sum, po) => sum + po.totalCost, 0);
    const totalPaid = supplier.payments.reduce((sum, p) => sum + p.amountPaid, 0);
    const outstandingBalance = Math.max(0, totalPurchases - totalPaid);

    // Outstanding invoices (POs that are APPROVED or RECEIVED but not fully PAID or total cost > payments for it)
    // For simplicity, outstanding invoices can be POs whose status is APPROVED or RECEIVED and are not fully paid
    const outstandingInvoices = supplier.purchaseOrders.filter(
      po => ['APPROVED', 'RECEIVED'].includes(po.status)
    );

    res.json({
      id: supplier.id,
      name: supplier.name,
      companyName: supplier.companyName,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
      totals: {
        totalPurchases,
        totalPaid,
        outstandingBalance,
      },
      products: supplier.products,
      purchaseOrders: supplier.purchaseOrders,
      payments: supplier.payments,
      outstandingInvoices,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve supplier details', error: error.message });
  }
};

// 4. Update Supplier
export const updateSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { name, companyName, phone, email, address } = req.body;

    const existingSupplier = await prisma.supplier.findUnique({ where: { id } });
    if (!existingSupplier) {
      res.status(404).json({ message: 'Supplier not found' });
      return;
    }

    // Email collision check
    if (email && email !== existingSupplier.email) {
      const emailCollision = await prisma.supplier.findUnique({ where: { email } });
      if (emailCollision) {
        res.status(400).json({ message: 'Supplier with this email already exists' });
        return;
      }
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        name: name || existingSupplier.name,
        companyName: companyName || existingSupplier.companyName,
        phone: phone || existingSupplier.phone,
        email: email || existingSupplier.email,
        address: address || existingSupplier.address,
      }
    });

    // Audit Log
    await createAuditLog(userId, 'Updated supplier details', { supplierId: supplier.id, supplierName: supplier.name });

    res.json(supplier);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to update supplier', error: error.message });
  }
};

// 5. Delete Supplier
export const deleteSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const existingSupplier = await prisma.supplier.findUnique({ where: { id } });
    if (!existingSupplier) {
      res.status(404).json({ message: 'Supplier not found' });
      return;
    }

    // Check if supplier is linked to products or purchase orders
    const productsCount = await prisma.product.count({ where: { supplierId: id } });
    const poCount = await prisma.purchaseOrder.count({ where: { supplierId: id } });

    if (productsCount > 0 || poCount > 0) {
      res.status(400).json({
        message: 'Cannot delete supplier: they are associated with existing products or purchase orders.',
      });
      return;
    }

    await prisma.supplier.delete({ where: { id } });

    // Audit Log
    await createAuditLog(userId, 'Deleted supplier', { supplierId: id, supplierName: existingSupplier.name });

    res.json({ message: 'Supplier deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to delete supplier', error: error.message });
  }
};
