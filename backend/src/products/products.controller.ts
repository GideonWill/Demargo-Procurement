import { Request, Response } from 'express';
import prisma from '../database/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { createStockMovement } from '../utils/movement';
import { createAuditLog } from '../utils/audit';
import { createSystemNotification } from '../utils/notification';

// 1. Get Categories
export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { products: true }
        }
      }
    });
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve categories', error: error.message });
  }
};

// 2. Get Products (with Search, Category, Status Filtering)
export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const search = req.query.search ? String(req.query.search) : undefined;
    const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;

    const whereClause: any = {};

    // Search query mapping (name, code, or description)
    if (search) {
      whereClause.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { code: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } },
        { subCategory: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    // Category filter mapping
    if (categoryId) {
      whereClause.categoryId = String(categoryId);
    }

    // Status filter mapping:
    // - "available": qty > minStockLevel
    // - "low": qty <= minStockLevel AND qty > 0
    // - "out": qty === 0
    if (status) {
      if (status === 'out') {
        whereClause.quantityAvailable = 0;
      } else if (status === 'low') {
        whereClause.quantityAvailable = {
          gt: 0,
          lte: prisma.product.fields.minStockLevel, // Prisma field-to-field comparison or done dynamically?
          // Since Prisma doesn't directly support field-to-field compare easily without raw sql in some versions,
          // we'll fetch all and filter in JS if status is low/available, OR query creatively.
          // Let's implement dynamic filters in memory or write custom database query.
          // To be safe and compatible with Postgres, we can do it via raw query OR simple dynamic JS filtering.
          // However, JS filtering is extremely safe and easy for ERP scaling up to thousands of items.
        };
      } else if (status === 'available') {
        whereClause.quantityAvailable = {
          gt: prisma.product.fields.minStockLevel,
        };
      }
    }

    // Wait! Let's fetch all matching search & category, and do status filtering in JS to handle dynamic field comparisons cleanly
    let products = await prisma.product.findMany({
      where: {
        OR: whereClause.OR,
        categoryId: whereClause.categoryId,
      },
      include: {
        category: true,
        supplier: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (status) {
      products = products.filter((product) => {
        if (status === 'out') {
          return product.quantityAvailable === 0;
        } else if (status === 'low') {
          return product.quantityAvailable > 0 && product.quantityAvailable <= product.minStockLevel;
        } else if (status === 'available') {
          return product.quantityAvailable > product.minStockLevel;
        }
        return true;
      });
    }

    res.json(products);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve products', error: error.message });
  }
};

// 3. Get Single Product
export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        supplier: true,
        stockMovements: {
          include: {
            user: {
              select: { name: true, email: true }
            }
          },
          orderBy: { date: 'desc' }
        }
      }
    });

    if (!product) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    res.json(product);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve product details', error: error.message });
  }
};

// 4. Create Product
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const {
      name,
      code,
      categoryId,
      supplierId,
      purchasePrice,
      sellingPrice,
      measurementUnit,
      description,
      subCategory,
      quantityAvailable,
      minStockLevel,
    } = req.body;

    if (!name || !categoryId || !supplierId || purchasePrice === undefined || sellingPrice === undefined || !measurementUnit) {
      res.status(400).json({ message: 'Name, category, supplier, purchase price, selling price, and unit are required.' });
      return;
    }

    // Create the product
    const qty = parseFloat(quantityAvailable) || 0;
    const minLvl = parseFloat(minStockLevel) || 0;

    const product = await prisma.product.create({
      data: {
        name,
        code,
        categoryId,
        supplierId,
        purchasePrice: parseFloat(purchasePrice),
        sellingPrice: parseFloat(sellingPrice),
        measurementUnit,
        description,
        subCategory,
        quantityAvailable: qty,
        minStockLevel: minLvl,
      },
      include: {
        category: true,
        supplier: true,
      }
    });

    // Write initial stock movement if quantity is non-zero
    if (qty !== 0) {
      await createStockMovement(product.id, 0, qty, qty, userId, 'Initial stock setup');
    }

    // Trigger notification if low stock initially
    const io = req.app.get('io');
    if (qty === 0) {
      await createSystemNotification(io, `${product.name} is out of stock`, 'OUT_OF_STOCK');
    } else if (qty <= minLvl) {
      await createSystemNotification(io, `${product.name} is below minimum stock quantity`, 'LOW_STOCK');
    }

    // Audit Log
    await createAuditLog(userId, 'Created product', { productId: product.id, productName: product.name, qty });

    res.status(201).json(product);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to create product', error: error.message });
  }
};

// 5. Update Product
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const {
      name,
      code,
      categoryId,
      supplierId,
      purchasePrice,
      sellingPrice,
      measurementUnit,
      description,
      subCategory,
      quantityAvailable,
      minStockLevel,
      reason,
    } = req.body;

    const existingProduct = await prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    const newQty = quantityAvailable !== undefined ? parseFloat(quantityAvailable) : existingProduct.quantityAvailable;
    const newMinLvl = minStockLevel !== undefined ? parseFloat(minStockLevel) : existingProduct.minStockLevel;
    const oldQty = existingProduct.quantityAvailable;

    // Perform database update
    const product = await prisma.product.update({
      where: { id },
      data: {
        name: name || existingProduct.name,
        code: code !== undefined ? code : existingProduct.code,
        categoryId: categoryId || existingProduct.categoryId,
        supplierId: supplierId || existingProduct.supplierId,
        purchasePrice: purchasePrice !== undefined ? parseFloat(purchasePrice) : existingProduct.purchasePrice,
        sellingPrice: sellingPrice !== undefined ? parseFloat(sellingPrice) : existingProduct.sellingPrice,
        measurementUnit: measurementUnit || existingProduct.measurementUnit,
        description: description !== undefined ? description : existingProduct.description,
        subCategory: subCategory !== undefined ? subCategory : existingProduct.subCategory,
        quantityAvailable: newQty,
        minStockLevel: newMinLvl,
      },
      include: {
        category: true,
        supplier: true,
      }
    });

    const io = req.app.get('io');

    // If stock quantity changed, log movement
    if (newQty !== oldQty) {
      const change = newQty - oldQty;
      await createStockMovement(
        product.id,
        oldQty,
        change,
        newQty,
        userId,
        reason || (change > 0 ? 'Manual inventory addition' : 'Manual inventory reduction')
      );

      // Trigger low-stock alerts
      if (newQty === 0) {
        await createSystemNotification(io, `${product.name} is out of stock`, 'OUT_OF_STOCK');
      } else if (newQty <= newMinLvl) {
        await createSystemNotification(io, `${product.name} is below minimum stock quantity`, 'LOW_STOCK');
      }
    }

    // Audit Log
    await createAuditLog(userId, 'Updated product details', {
      productId: product.id,
      productName: product.name,
      previousQty: oldQty,
      newQty,
    });

    res.json(product);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to update product', error: error.message });
  }
};

// 6. Delete Product
export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const existingProduct = await prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    // To prevent orphans or db error, check if product is referenced in POs or Projects
    const poItemsCount = await prisma.purchaseOrderItem.count({ where: { productId: id } });
    const projectCount = await prisma.projectMaterial.count({ where: { productId: id } });

    if (poItemsCount > 0 || projectCount > 0) {
      res.status(400).json({
        message: 'Cannot delete product: it is associated with existing purchase orders or projects. Try adjusting quantity instead.',
      });
      return;
    }

    // Delete related stock movements first
    await prisma.stockMovement.deleteMany({ where: { productId: id } });

    await prisma.product.delete({ where: { id } });

    // Audit Log
    await createAuditLog(userId, 'Deleted product', { productId: id, productName: existingProduct.name });

    res.json({ message: 'Product deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to delete product', error: error.message });
  }
};
