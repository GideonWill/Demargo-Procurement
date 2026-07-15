'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useQuery } from '@tanstack/react-query';
import ApiClient from '@/services/api';
import {
  ArrowDownTrayIcon,
  PrinterIcon,
  ArchiveBoxIcon,
  ClipboardDocumentListIcon,
  UserGroupIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline';

interface InventoryReportRow {
  id: string;
  name: string;
  category: string;
  subCategory: string;
  quantity: number;
  unit: string;
  minLevel: number;
  purchasePrice: number;
  sellingPrice: number;
  inventoryValue: number;
  supplier: string;
  status: string;
  lastUpdated: string;
}

interface SupplierReportRow {
  supplierId: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  totalPurchases: number;
  totalPaid: number;
  outstandingBalance: number;
  poCount: number;
  paymentCount: number;
}

interface FinancialLedgerRow {
  paymentId: string;
  invoiceNumber: string;
  poNumber: string;
  supplierName: string;
  amountPaid: number;
  paymentMethod: string;
  paymentDate: string;
  notes: string;
}

interface FinancialReportData {
  totalExpenses: number;
  paymentsLedger: FinancialLedgerRow[];
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(val);
};

// Client-side CSV Download Helper
const exportToCSV = (headers: string[], rows: (string | number)[][], filename: string) => {
  const content = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((val) => {
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function ReportsPage() {
  // Tabs: 'inventory' | 'purchases' | 'suppliers' | 'financial'
  const [activeTab, setActiveTab] = useState<'inventory' | 'purchases' | 'suppliers' | 'financial'>('inventory');

  // Queries
  const { data: inventoryReport = [], isLoading: inventoryLoading } = useQuery<InventoryReportRow[]>({
    queryKey: ['report-inventory'],
    queryFn: () => ApiClient.get('/reports/inventory'),
    enabled: activeTab === 'inventory',
  });

  const { data: purchaseReport = [], isLoading: purchaseLoading } = useQuery<any[]>({
    queryKey: ['report-purchases'],
    queryFn: () => ApiClient.get('/reports/purchases'),
    enabled: activeTab === 'purchases',
  });

  const { data: supplierReport = [], isLoading: supplierLoading } = useQuery<SupplierReportRow[]>({
    queryKey: ['report-suppliers'],
    queryFn: () => ApiClient.get('/reports/suppliers'),
    enabled: activeTab === 'suppliers',
  });

  const { data: financialReport, isLoading: financialLoading } = useQuery<FinancialReportData>({
    queryKey: ['report-financial'],
    queryFn: () => ApiClient.get('/reports/financial'),
    enabled: activeTab === 'financial',
  });

  const handlePrint = () => {
    window.print();
  };

  // Export handlers
  const handleExportInventory = () => {
    const headers = ['Product ID', 'Name', 'Category', 'Subcategory', 'Quantity', 'Unit', 'Min Level', 'Purchase Price (GHS)', 'Selling Price (GHS)', 'Inventory Value (GHS)', 'Supplier', 'Status'];
    const rows = inventoryReport.map((r) => [
      r.id,
      r.name,
      r.category,
      r.subCategory,
      r.quantity,
      r.unit,
      r.minLevel,
      r.purchasePrice,
      r.sellingPrice,
      r.inventoryValue,
      r.supplier,
      r.status,
    ]);
    exportToCSV(headers, rows, `Demargo_Inventory_Report_${new Date().toISOString().slice(0, 10)}`);
  };

  const handleExportPurchases = () => {
    const headers = ['PO Number', 'Supplier', 'Order Date', 'Total Cost (GHS)', 'Status', 'Ordered Products'];
    const rows = purchaseReport.map((po) => [
      po.poNumber,
      po.supplier.companyName,
      new Date(po.date).toLocaleDateString(),
      po.totalCost,
      po.status,
      po.items.map((i: any) => `${i.product.name} (x${i.quantity})`).join('; '),
    ]);
    exportToCSV(headers, rows, `Demargo_Purchase_Report_${new Date().toISOString().slice(0, 10)}`);
  };

  const handleExportSuppliers = () => {
    const headers = ['Supplier ID', 'Contact Name', 'Company Name', 'Phone', 'Email', 'Total Billed (GHS)', 'Total Settled (GHS)', 'Outstanding Balance (GHS)', 'PO Count', 'Payments Count'];
    const rows = supplierReport.map((s) => [
      s.supplierId,
      s.name,
      s.companyName,
      s.phone,
      s.email,
      s.totalPurchases,
      s.totalPaid,
      s.outstandingBalance,
      s.poCount,
      s.paymentCount,
    ]);
    exportToCSV(headers, rows, `Demargo_Supplier_Report_${new Date().toISOString().slice(0, 10)}`);
  };

  const handleExportFinancial = () => {
    if (!financialReport) return;
    const headers = ['Payment ID', 'Invoice Number', 'PO Number', 'Supplier', 'Amount Settled (GHS)', 'Method', 'Date', 'Notes'];
    const rows = financialReport.paymentsLedger.map((p) => [
      p.paymentId,
      p.invoiceNumber,
      p.poNumber,
      p.supplierName,
      p.amountPaid,
      p.paymentMethod,
      new Date(p.paymentDate).toLocaleDateString(),
      p.notes,
    ]);
    exportToCSV(headers, rows, `Demargo_Financial_Report_${new Date().toISOString().slice(0, 10)}`);
  };

  const isLoading = inventoryLoading || purchaseLoading || supplierLoading || financialLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6 print:space-y-4 print:p-0">
        {/* Header Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0 print:hidden">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Reports and Audits Module</h2>
            <p className="text-sm text-slate-500">Extract ledger reports, download CSVs, or print records to PDF.</p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
            >
              <PrinterIcon className="h-4.5 w-4.5" />
              <span>Print PDF</span>
            </button>
            <button
              onClick={() => {
                if (activeTab === 'inventory') handleExportInventory();
                if (activeTab === 'purchases') handleExportPurchases();
                if (activeTab === 'suppliers') handleExportSuppliers();
                if (activeTab === 'financial') handleExportFinancial();
              }}
              className="flex items-center space-x-1 bg-orange-500 hover:bg-orange-600 text-white px-3.5 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors"
            >
              <ArrowDownTrayIcon className="h-4.5 w-4.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* PRINT ONLY BRAND HEADER */}
        <div className="hidden print:flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-4">
          <div>
            <span className="text-orange-500 font-extrabold text-2xl tracking-wider">DEMARGO PROCUREMENT</span>
            <p className="text-xs text-slate-500 font-semibold mt-1">Interior Design Contractors - Accounting Ledger</p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <p>Report Date: {new Date().toLocaleDateString()}</p>
            <p>Printed by: Demargo Admin</p>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-1 space-x-1 print:hidden">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors inline-flex justify-center items-center space-x-1.5 ${
              activeTab === 'inventory' ? 'bg-orange-500 text-white shadow' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <ArchiveBoxIcon className="h-4.5 w-4.5" />
            <span className="hidden sm:inline">Inventory Report</span>
          </button>
          <button
            onClick={() => setActiveTab('purchases')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors inline-flex justify-center items-center space-x-1.5 ${
              activeTab === 'purchases' ? 'bg-orange-500 text-white shadow' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <ClipboardDocumentListIcon className="h-4.5 w-4.5" />
            <span className="hidden sm:inline">Purchase Orders</span>
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors inline-flex justify-center items-center space-x-1.5 ${
              activeTab === 'suppliers' ? 'bg-orange-500 text-white shadow' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <UserGroupIcon className="h-4.5 w-4.5" />
            <span className="hidden sm:inline">Suppliers registry</span>
          </button>
          <button
            onClick={() => setActiveTab('financial')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors inline-flex justify-center items-center space-x-1.5 ${
              activeTab === 'financial' ? 'bg-orange-500 text-white shadow' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <BanknotesIcon className="h-4.5 w-4.5" />
            <span className="hidden sm:inline">Financial Ledger</span>
          </button>
        </div>

        {/* Tab Content Display */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none">
          {isLoading ? (
            <div className="h-96 flex items-center justify-center print:hidden">
              <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : (
            <div className="p-6 print:p-0">
              {/* --- INVENTORY REPORT TAB --- */}
              {activeTab === 'inventory' && (
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-slate-800 hidden print:block">Current Stock Valuation Report</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Product Name</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Category</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Qty Available</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Unit Cost</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Inventory Value</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Supplier</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {inventoryReport.map((row) => (
                          <tr key={row.id}>
                            <td className="px-4 py-3 font-bold text-slate-800">{row.name}</td>
                            <td className="px-4 py-3 text-slate-500">{row.category}</td>
                            <td className="px-4 py-3 font-semibold text-slate-700">{row.quantity} {row.unit}</td>
                            <td className="px-4 py-3 text-slate-500">GHS {row.purchasePrice}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">{formatCurrency(row.inventoryValue)}</td>
                            <td className="px-4 py-3 text-slate-600">{row.supplier}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                row.status === 'OUT_OF_STOCK'
                                  ? 'bg-red-100 text-red-800'
                                  : row.status === 'LOW_STOCK'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {row.status.replace('_', ' ')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* --- PURCHASE ORDER REPORT --- */}
              {activeTab === 'purchases' && (
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-slate-800 hidden print:block">Supplier Purchase Orders Report</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">PO Number</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Supplier Name</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Order Date</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Total Cost</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {purchaseReport.map((po) => (
                          <tr key={po.id}>
                            <td className="px-4 py-3 font-bold text-slate-800">{po.poNumber}</td>
                            <td className="px-4 py-3 text-slate-700 font-medium">{po.supplier.companyName}</td>
                            <td className="px-4 py-3 text-slate-500">{new Date(po.date).toLocaleDateString()}</td>
                            <td className="px-4 py-3 font-extrabold text-slate-800">{formatCurrency(po.totalCost)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                po.status === 'PAID' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {po.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* --- SUPPLIER REGISTRY REPORT --- */}
              {activeTab === 'suppliers' && (
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-slate-800 hidden print:block">Suppliers Ledger Balance Summary</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Company Name</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Phone / Email</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Total Billed</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Total Paid</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Account Balance</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {supplierReport.map((row) => (
                          <tr key={row.supplierId}>
                            <td className="px-4 py-3 font-bold text-slate-800">{row.companyName}</td>
                            <td className="px-4 py-3 text-slate-500">
                              <p>{row.phone}</p>
                              <p className="text-xs">{row.email}</p>
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-700">{formatCurrency(row.totalPurchases)}</td>
                            <td className="px-4 py-3 font-semibold text-green-600">{formatCurrency(row.totalPaid)}</td>
                            <td className={`px-4 py-3 font-extrabold ${row.outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatCurrency(row.outstandingBalance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* --- FINANCIAL REPORT --- */}
              {activeTab === 'financial' && financialReport && (
                <div className="space-y-6">
                  {/* Summary expenses */}
                  <div className="p-5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center max-w-sm">
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase block tracking-wider">Cumulative Expenses</span>
                      <span className="text-2xl font-black text-slate-800">{formatCurrency(financialReport.totalExpenses)}</span>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-slate-800 hidden print:block">Corporate Cash Expenditure Ledger</h3>
                  
                  {/* Detailed Ledger table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Invoice Ref</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">PO Number</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Supplier</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Post Date</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Payment Method</th>
                          <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Amount Paid</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {financialReport.paymentsLedger.map((row) => (
                          <tr key={row.paymentId}>
                            <td className="px-4 py-3 font-bold text-slate-850">{row.invoiceNumber}</td>
                            <td className="px-4 py-3 text-slate-500 font-semibold">{row.poNumber}</td>
                            <td className="px-4 py-3 text-slate-700 font-medium">{row.supplierName}</td>
                            <td className="px-4 py-3 text-slate-500">{new Date(row.paymentDate).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-slate-500">{row.paymentMethod.replace('_', ' ')}</td>
                            <td className="px-4 py-3 font-extrabold text-green-600">{formatCurrency(row.amountPaid)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
