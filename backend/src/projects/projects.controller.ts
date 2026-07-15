import { Request, Response } from 'express';
import prisma from '../database/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { createStockMovement } from '../utils/movement';
import { createAuditLog } from '../utils/audit';
import { createSystemNotification } from '../utils/notification';
import { ProjectStatus } from '@prisma/client';

// 1. Create Project
export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { clientName, location, projectType, startDate, status } = req.body;

    if (!clientName || !location || !projectType || !startDate) {
      res.status(400).json({ message: 'Client name, location, project type, and start date are required' });
      return;
    }

    const project = await prisma.project.create({
      data: {
        clientName,
        location,
        projectType,
        startDate: new Date(startDate),
        status: (status as ProjectStatus) || ProjectStatus.PLANNING,
      },
    });

    // Audit Log
    await createAuditLog(userId, 'Created project', { projectId: project.id, clientName: project.clientName });

    res.status(201).json(project);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to create project', error: error.message });
  }
};

// 2. Get Projects (includes materials count)
export const getProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        materials: {
          include: {
            product: {
              select: { name: true, measurementUnit: true }
            }
          }
        }
      },
      orderBy: { startDate: 'desc' },
    });

    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve projects', error: error.message });
  }
};

// 3. Get Project details with materials
export const getProjectById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        materials: {
          include: {
            product: {
              include: { category: true }
            }
          }
        }
      }
    });

    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    res.json(project);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve project details', error: error.message });
  }
};

// 4. Update Project Status / Details
export const updateProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { clientName, location, projectType, startDate, status } = req.body;

    const existingProject = await prisma.project.findUnique({ where: { id } });
    if (!existingProject) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        clientName: clientName || existingProject.clientName,
        location: location || existingProject.location,
        projectType: projectType || existingProject.projectType,
        startDate: startDate ? new Date(startDate) : existingProject.startDate,
        status: status || existingProject.status,
      }
    });

    // Audit Log
    await createAuditLog(userId, 'Updated project details', { projectId: updatedProject.id, clientName: updatedProject.clientName });

    res.json(updatedProject);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to update project', error: error.message });
  }
};

// 5. Allocate Materials (Reserve Stock)
export const allocateMaterials = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id); // Project ID
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { materials } = req.body; // Array of { productId, quantity }

    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      res.status(400).json({ message: 'Materials array is required and must not be empty' });
      return;
    }

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    // Run within a Prisma transaction to guarantee atomic execution
    const result = await prisma.$transaction(async (tx) => {
      const allocatedItems = [];
      const io = req.app.get('io');

      for (const item of materials) {
        const { productId, quantity } = item;
        const qty = parseFloat(quantity);

        if (!productId || isNaN(qty) || qty <= 0) {
          throw new Error('Invalid product ID or quantity');
        }

        // Fetch product inside transaction with category information
        const product = await tx.product.findUnique({
          where: { id: productId },
          include: { category: true }
        });
        if (!product) {
          throw new Error(`Product not found with ID: ${productId}`);
        }

        const isCurtainMaterial = product.category.name === 'Curtain Materials';

        // Check stock availability (Only bypass for Curtain Materials)
        if (!isCurtainMaterial && product.quantityAvailable < qty) {
          throw new Error(`Insufficient stock for product "${product.name}". Available: ${product.quantityAvailable} ${product.measurementUnit}, Requested: ${qty}`);
        }

        const newQty = product.quantityAvailable - qty;

        // 1. Update Product Quantity
        const updatedProduct = await tx.product.update({
          where: { id: productId },
          data: { quantityAvailable: newQty },
        });

        // 2. Create ProjectMaterial Entry
        const projectMaterial = await tx.projectMaterial.create({
          data: {
            projectId: id,
            productId,
            qtyReserved: qty,
            isConsumed: false,
          },
          include: { product: true }
        });

        // 3. Log Stock Movement
        await tx.stockMovement.create({
          data: {
            productId,
            previousQuantity: product.quantityAvailable,
            change: -qty,
            newQuantity: newQty,
            userId,
            reason: `Reserved for project: ${project.clientName} (${project.location})`,
          }
        });

        // 4. Trigger Real-time Notifications if stock levels dip
        if (newQty === 0) {
          await createSystemNotification(io, `${product.name} is out of stock`, 'OUT_OF_STOCK');
        } else if (newQty <= product.minStockLevel) {
          await createSystemNotification(io, `${product.name} is below minimum stock quantity`, 'LOW_STOCK');
        }

        allocatedItems.push(projectMaterial);
      }

      return allocatedItems;
    });

    // Audit Log
    await createAuditLog(userId, 'Allocated materials to project', {
      projectId: id,
      projectName: project.clientName,
      items: materials,
    });

    res.status(200).json({
      message: 'Materials allocated and stock reserved successfully',
      allocatedMaterials: result,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// 6. Consume Materials
export const consumeMaterials = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id); // Project ID
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { materialIds } = req.body; // Array of ProjectMaterial IDs to mark as consumed

    if (!materialIds || !Array.isArray(materialIds) || materialIds.length === 0) {
      res.status(400).json({ message: 'Material IDs array is required and must not be empty' });
      return;
    }

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const updatedMaterials = await prisma.projectMaterial.updateMany({
      where: {
        id: { in: materialIds },
        projectId: id,
        isConsumed: false,
      },
      data: { isConsumed: true },
    });

    // Audit Log
    await createAuditLog(userId, 'Consumed project materials', {
      projectId: id,
      projectName: project.clientName,
      consumedCount: updatedMaterials.count,
      materialIds,
    });

    res.json({
      message: 'Project materials successfully marked as consumed',
      count: updatedMaterials.count,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to consume materials', error: error.message });
  }
};

// 7. Delete Project (Restores unconsumed reserved stock)
export const deleteProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        materials: {
          include: { product: true }
        }
      }
    });

    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    // Run inside transaction to safely delete project and release reserved stocks back to inventory
    await prisma.$transaction(async (tx) => {
      const io = req.app.get('io');
      
      // Filter out materials that were reserved but NOT yet consumed
      const unconsumedMaterials = project.materials.filter(m => !m.isConsumed);

      for (const mat of unconsumedMaterials) {
        const product = await tx.product.findUnique({ where: { id: mat.productId } });
        if (product) {
          const restoredQty = product.quantityAvailable + mat.qtyReserved;

          // Restore product quantity available
          await tx.product.update({
            where: { id: mat.productId },
            data: { quantityAvailable: restoredQty }
          });

          // Log stock movement for restoration
          await tx.stockMovement.create({
            data: {
              productId: mat.productId,
              previousQuantity: product.quantityAvailable,
              change: mat.qtyReserved,
              newQuantity: restoredQty,
              userId,
              reason: `Released reservation: Project deleted (${project.clientName})`,
            }
          });
        }
      }

      // Delete all related ProjectMaterial entries (cascade or manually)
      await tx.projectMaterial.deleteMany({ where: { projectId: id } });

      // Delete project
      await tx.project.delete({ where: { id } });
    });

    // Audit Log
    await createAuditLog(userId, 'Deleted project & restored reserved stocks', {
      projectId: id,
      projectName: project.clientName,
    });

    res.json({ message: 'Project deleted and unconsumed reserved stock returned to inventory successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to delete project', error: error.message });
  }
};
