import { Router } from 'express';
import {
  getDashboardKPIs,
  getPurchasesChartData,
  getCategoriesChartData,
  getInventoryReport,
  getPurchaseReport,
  getSupplierReport,
  getFinancialReport,
} from './reports.controller';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

// Dashboard analytics & charts data
router.get('/dashboard-kpis', authenticateJWT, getDashboardKPIs);
router.get('/charts/purchases', authenticateJWT, getPurchasesChartData);
router.get('/charts/categories', authenticateJWT, getCategoriesChartData);

// Report data extraction
router.get('/inventory', authenticateJWT, getInventoryReport);
router.get('/purchases', authenticateJWT, getPurchaseReport);
router.get('/suppliers', authenticateJWT, getSupplierReport);
router.get('/financial', authenticateJWT, getFinancialReport);

export default router;
