import { Request, Response } from 'express';
import prisma from '../database/prisma';

// 1. Get Dashboard KPI Overview Metrics
export const getDashboardKPIs = async (req: Request, res: Response): Promise<void> => {
  try {
    // Basic counts
    const totalProducts = await prisma.product.count();
    const totalSuppliers = await prisma.supplier.count();

    // Products fetch to do stock status and valuation
    const products = await prisma.product.findMany();
    
    let totalInventoryValue = 0;
    let availableStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    products.forEach((product) => {
      totalInventoryValue += product.quantityAvailable * product.purchasePrice;

      if (product.quantityAvailable === 0) {
        outOfStockCount++;
      } else if (product.quantityAvailable <= product.minStockLevel) {
        lowStockCount++;
      } else {
        availableStockCount++;
      }
    });

    // Purchase Order Totals (Approved, Received, Paid)
    const activePOs = await prisma.purchaseOrder.findMany({
      where: {
        status: { in: ['APPROVED', 'RECEIVED', 'PAID'] }
      },
      select: { totalCost: true }
    });
    const totalPurchasesAmount = activePOs.reduce((sum, po) => sum + po.totalCost, 0);

    // Payments recorded
    const payments = await prisma.payment.findMany({
      select: { amountPaid: true }
    });
    const totalPaidAmount = payments.reduce((sum, p) => sum + p.amountPaid, 0);
    const outstandingPayments = Math.max(0, totalPurchasesAmount - totalPaidAmount);

    res.json({
      totalProducts,
      totalSuppliers,
      totalInventoryValue,
      availableStockCount,
      lowStockCount,
      outOfStockCount,
      totalPurchasesAmount,
      totalPaidAmount,
      outstandingPayments,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve dashboard metrics', error: error.message });
  }
};

// 2. Monthly Spending Chart Data (Recharts bar/line chart)
export const getPurchasesChartData = async (req: Request, res: Response): Promise<void> => {
  try {
    // Fetch all active POs
    const pos = await prisma.purchaseOrder.findMany({
      where: {
        status: { in: ['APPROVED', 'RECEIVED', 'PAID'] }
      },
      select: { date: true, totalCost: true },
      orderBy: { date: 'asc' }
    });

    // Initialize last 6 months
    const chartDataMap: { [key: string]: number } = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Setup last 6 months in order
    const last6Months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mName = months[d.getMonth()] + ' ' + d.getFullYear().toString().slice(-2);
      last6Months.push(mName);
      chartDataMap[mName] = 0;
    }

    // Populate data
    pos.forEach((po) => {
      const poDate = new Date(po.date);
      const mName = months[poDate.getMonth()] + ' ' + poDate.getFullYear().toString().slice(-2);
      
      if (chartDataMap[mName] !== undefined) {
        chartDataMap[mName] += po.totalCost;
      }
    });

    const chartData = last6Months.map((month) => ({
      name: month,
      amount: chartDataMap[month],
    }));

    res.json(chartData);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve purchases chart data', error: error.message });
  }
};

// 3. Inventory Categories Distribution Chart Data (Recharts pie/donut chart)
export const getCategoriesChartData = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        products: {
          select: {
            quantityAvailable: true,
            purchasePrice: true,
          }
        }
      }
    });

    const chartData = categories.map((cat) => {
      const value = cat.products.reduce(
        (sum, prod) => sum + prod.quantityAvailable * prod.purchasePrice,
        0
      );

      return {
        name: cat.name,
        value: parseFloat(value.toFixed(2)),
        productsCount: cat.products.length,
      };
    });

    res.json(chartData);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve categories chart data', error: error.message });
  }
};

// 4. Detailed Inventory Report
export const getInventoryReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: true,
        supplier: true,
      },
      orderBy: { name: 'asc' },
    });

    const report = products.map((p) => {
      const value = p.quantityAvailable * p.purchasePrice;
      let status = 'AVAILABLE';
      if (p.quantityAvailable === 0) {
        status = 'OUT_OF_STOCK';
      } else if (p.quantityAvailable <= p.minStockLevel) {
        status = 'LOW_STOCK';
      }

      return {
        id: p.id,
        name: p.name,
        category: p.category.name,
        subCategory: p.subCategory || '-',
        quantity: p.quantityAvailable,
        unit: p.measurementUnit,
        minLevel: p.minStockLevel,
        purchasePrice: p.purchasePrice,
        sellingPrice: p.sellingPrice,
        inventoryValue: value,
        supplier: p.supplier.name,
        status,
        lastUpdated: p.updatedAt,
      };
    });

    res.json(report);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to generate inventory report', error: error.message });
  }
};

// 5. Detailed Purchase Report
export const getPurchaseReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const pos = await prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        items: {
          include: { product: true }
        }
      },
      orderBy: { date: 'desc' },
    });

    res.json(pos);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to generate purchase report', error: error.message });
  }
};

// 6. Detailed Supplier Report
export const getSupplierReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const suppliers = await prisma.supplier.findMany({
      include: {
        purchaseOrders: {
          where: { status: { in: ['APPROVED', 'RECEIVED', 'PAID'] } }
        },
        payments: true,
      },
      orderBy: { name: 'asc' },
    });

    const report = suppliers.map((supplier) => {
      const totalPurchases = supplier.purchaseOrders.reduce((sum, po) => sum + po.totalCost, 0);
      const totalPaid = supplier.payments.reduce((sum, p) => sum + p.amountPaid, 0);
      const outstandingBalance = Math.max(0, totalPurchases - totalPaid);

      return {
        supplierId: supplier.id,
        name: supplier.name,
        companyName: supplier.companyName,
        phone: supplier.phone,
        email: supplier.email,
        totalPurchases,
        totalPaid,
        outstandingBalance,
        poCount: supplier.purchaseOrders.length,
        paymentCount: supplier.payments.length,
      };
    });

    res.json(report);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to generate supplier report', error: error.message });
  }
};

// 7. Financial Expenses & Ledger Report
export const getFinancialReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        supplier: true,
        purchaseOrder: true,
      },
      orderBy: { paymentDate: 'desc' },
    });

    const totalSpent = payments.reduce((sum, p) => sum + p.amountPaid, 0);

    res.json({
      totalExpenses: totalSpent,
      paymentsLedger: payments.map((p) => ({
        paymentId: p.id,
        invoiceNumber: p.invoiceNumber,
        poNumber: p.purchaseOrder.poNumber,
        supplierName: p.supplier.name,
        amountPaid: p.amountPaid,
        paymentMethod: p.paymentMethod,
        paymentDate: p.paymentDate,
        notes: p.notes || '-',
      })),
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to generate financial report', error: error.message });
  }
};
