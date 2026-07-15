'use client';

import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useQuery } from '@tanstack/react-query';
import ApiClient from '@/services/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import {
  Squares2X2Icon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  ShoppingCartIcon,
  CreditCardIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';

interface KPIs {
  totalProducts: number;
  totalSuppliers: number;
  totalInventoryValue: number;
  availableStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalPurchasesAmount: number;
  totalPaidAmount: number;
  outstandingPayments: number;
}

interface ChartItem {
  name: string;
  amount: number;
}

interface CategoryChartItem {
  name: string;
  value: number;
  productsCount: number;
}

interface LowStockProduct {
  id: string;
  name: string;
  subCategory: string;
  quantityAvailable: number;
  minStockLevel: number;
  measurementUnit: string;
}

const CATEGORY_COLORS = ['#3b82f6', '#f97316', '#f59e0b', '#64748b']; // Blue, Orange, Amber, Slate

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(val);
};

export default function DashboardPage() {
  // 1. Fetch KPIs
  const { data: kpis, isLoading: kpisLoading, error: kpisError, refetch: refetchKpis, isFetching: kpisFetching } = useQuery<KPIs>({
    queryKey: ['dashboard-kpis'],
    queryFn: () => ApiClient.get('/reports/dashboard-kpis'),
  });

  // 2. Fetch Spending Chart
  const { data: spendingChart = [], isLoading: spendingLoading, refetch: refetchSpending, isFetching: spendingFetching } = useQuery<ChartItem[]>({
    queryKey: ['chart-spending'],
    queryFn: () => ApiClient.get('/reports/charts/purchases'),
  });

  // 3. Fetch Category Chart
  const { data: categoryChart = [], isLoading: categoryLoading, refetch: refetchCategories, isFetching: categoryFetching } = useQuery<CategoryChartItem[]>({
    queryKey: ['chart-categories'],
    queryFn: () => ApiClient.get('/reports/charts/categories'),
  });

  // 4. Fetch Low Stock items for table
  const { data: lowStockProducts = [], isLoading: lowStockLoading, refetch: refetchLowStock, isFetching: lowStockFetching } = useQuery<any[]>({
    queryKey: ['products-low-stock'],
    queryFn: async () => {
      const allProducts = await ApiClient.get('/products');
      return allProducts.filter(
        (p: any) => p.quantityAvailable <= p.minStockLevel
      ).slice(0, 5); // display top 5
    },
  });

  const isLoading = kpisLoading || spendingLoading || categoryLoading || lowStockLoading;
  const isSyncing = kpisFetching || spendingFetching || categoryFetching || lowStockFetching;

  const handleSync = () => {
    refetchKpis();
    refetchSpending();
    refetchCategories();
    refetchLowStock();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Operational Overview</h2>
            <p className="text-sm text-slate-500">Real-time status of Procurement Contractor inventories and suppliers.</p>
          </div>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:bg-slate-50 text-slate-700 disabled:text-slate-400 rounded-lg text-sm font-semibold shadow-sm transition-colors"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isSyncing ? 'animate-spin text-orange-500' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
        </div>

        {/* Loading / Error States */}
        {isLoading && (
          <div className="h-96 flex items-center justify-center">
            <svg className="animate-spin h-10 w-10 text-orange-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}

        {kpisError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium">
            Error loading ERP statistics. Please confirm your database connection is active.
          </div>
        )}

        {!isLoading && kpis && (
          <>
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Card 1: Total Products */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                  <Squares2X2Icon className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Products</span>
                  <span className="text-2xl font-black text-slate-800">{kpis.totalProducts}</span>
                </div>
              </div>

              {/* Card 2: Inventory Value */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
                  <CurrencyDollarIcon className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Inventory Value</span>
                  <span className="text-xl font-black text-slate-800 truncate block">
                    {formatCurrency(kpis.totalInventoryValue)}
                  </span>
                </div>
              </div>

              {/* Card 3: Total Suppliers */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                  <UserGroupIcon className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Suppliers Registry</span>
                  <span className="text-2xl font-black text-slate-800">{kpis.totalSuppliers}</span>
                </div>
              </div>

              {/* Card 4: Outstanding Payments */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-red-50 text-red-600 rounded-lg">
                  <CreditCardIcon className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Outstanding Balances</span>
                  <span className="text-xl font-black text-slate-800 truncate block">
                    {formatCurrency(kpis.outstandingPayments)}
                  </span>
                </div>
              </div>
            </div>

            {/* Stock Levels Status Indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* Available */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3.5">
                <div className="h-3 w-3 rounded-full bg-green-500 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase block">Available Stock Products</span>
                  <span className="text-lg font-extrabold text-slate-800">{kpis.availableStockCount} items</span>
                </div>
              </div>

              {/* Low Stock */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3.5">
                <div className="h-3 w-3 rounded-full bg-amber-500 shrink-0 animate-ping" />
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase block">Low Stock Warnings</span>
                  <span className="text-lg font-extrabold text-amber-600">{kpis.lowStockCount} items</span>
                </div>
              </div>

              {/* Out of Stock */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3.5">
                <div className="h-3 w-3 rounded-full bg-red-500 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase block">Out of Stock Items</span>
                  <span className="text-lg font-extrabold text-red-600">{kpis.outOfStockCount} items</span>
                </div>
              </div>
            </div>

            {/* Recharts Analytics Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Purchase Spending Chart */}
              <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
                <div className="mb-4">
                  <h3 className="text-base font-bold text-slate-800">Monthly Spending Ledger</h3>
                  <p className="text-xs text-slate-400">Total volume of approved purchase orders in Ghanaian Cedi (GHS).</p>
                </div>
                <div className="flex-1 w-full min-h-0">
                  {spendingChart.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">No spending data registered.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={spendingChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} fontWeight={600} />
                        <YAxis stroke="#94a3b8" fontSize={11} fontWeight={600} />
                        <Tooltip
                          formatter={(value) => [`GHS ${Number(value).toLocaleString()}`, 'Purchases']}
                          contentStyle={{ background: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                        />
                        <Bar dataKey="amount" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={45} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Category Inventory Share Chart */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
                <div className="mb-4">
                  <h3 className="text-base font-bold text-slate-800">Inventory Distribution</h3>
                  <p className="text-xs text-slate-400">Inventory valuation share split by main product categories.</p>
                </div>
                <div className="flex-1 w-full min-h-0 relative flex items-center justify-center">
                  {categoryChart.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">No categories registered.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryChart}
                          cx="50%"
                          cy="45%"
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {categoryChart.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [`GHS ${Number(value).toLocaleString()}`, 'Valuation']}
                          contentStyle={{ background: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          iconType="circle"
                          iconSize={8}
                          wrapperStyle={{ fontSize: '11px', fontWeight: 600, color: '#334155' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Low Stock Alerts Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Critical Stock Warning List</h3>
                  <p className="text-xs text-slate-400">Inventory items currently at or below minimum threshold levels.</p>
                </div>
                <Link
                  href="/inventory"
                  className="text-xs text-orange-500 font-bold hover:underline"
                >
                  Manage Stock
                </Link>
              </div>

              {lowStockProducts.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  <CheckCircleIcon className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  All stock counts are within healthy bounds.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Product Name</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Subcategory</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Qty Available</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Min Stock Limit</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {lowStockProducts.map((p) => {
                        const isOut = p.quantityAvailable === 0;
                        return (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800">{p.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{p.subCategory || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-700">
                              {p.quantityAvailable} {p.measurementUnit}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                              {p.minStockLevel} {p.measurementUnit}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                                isOut ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {isOut ? 'OUT OF STOCK' : 'LOW STOCK'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
