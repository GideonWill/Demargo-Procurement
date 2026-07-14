'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ApiClient from '@/services/api';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as zod from 'zod';
import { useAuth } from '@/components/AuthContext';
import {
  PlusIcon,
  ArrowLeftIcon,
  TrashIcon,
  CheckIcon,
  InboxArrowDownIcon,
  XMarkIcon,
  DocumentTextIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

// PO Item schema
const poItemSchema = zod.object({
  productId: zod.string().min(1, 'Product is required'),
  quantity: zod.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, 'Qty must be > 0'),
  unitCost: zod.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, 'Cost must be >= 0'),
});

// PO Creator schema
const poSchema = zod.object({
  supplierId: zod.string().min(1, 'Supplier is required'),
  items: zod.array(poItemSchema).min(1, 'Must add at least one item to purchase order'),
});

type POFormValues = zod.infer<typeof poSchema>;

interface Product {
  id: string;
  name: string;
  purchasePrice: number;
  measurementUnit: string;
}

interface Supplier {
  id: string;
  name: string;
  companyName: string;
  address: string;
}

interface POItem {
  id: string;
  productId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  product: {
    name: string;
    measurementUnit: string;
  };
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'RECEIVED' | 'PAID' | 'CANCELLED';
  totalCost: number;
  supplier: Supplier;
  items: POItem[];
  payments: any[];
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(val);
};

export default function PurchasesPage() {
  const { user, isAdmin, isStoreManager } = useAuth();
  const queryClient = useQueryClient();

  // Mode: 'list' | 'create' | 'details'
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'details'>('list');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  // Forms setup
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<POFormValues>({
    resolver: zodResolver(poSchema),
    defaultValues: { supplierId: '', items: [{ productId: '', quantity: '', unitCost: '' }] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  // Watch items to calculate PO total dynamically
  const watchedItems = watch('items');

  // Queries
  const { data: purchaseOrders = [], isLoading: posLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders'],
    queryFn: () => ApiClient.get('/purchases'),
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => ApiClient.get('/suppliers'),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-for-po'],
    queryFn: () => ApiClient.get('/products'),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: POFormValues) => ApiClient.post('/purchases', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setViewMode('list');
      reset();
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to create PO');
    }
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => ApiClient.put(`/purchases/${id}/approve`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      if (selectedPO?.id === data.id) setSelectedPO(data);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) => ApiClient.put(`/purchases/${id}/receive`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      if (selectedPO?.id === data.id) setSelectedPO(data);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => ApiClient.put(`/purchases/${id}/cancel`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      if (selectedPO?.id === data.id) setSelectedPO(data);
    },
  });

  const onSubmit = (values: POFormValues) => {
    createMutation.mutate(values);
  };

  const handleProductSelectChange = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      setValue(`items.${index}.unitCost`, product.purchasePrice.toString());
    }
  };

  // Calculate row total helper
  const calculateRowTotal = (qtyStr: string, costStr: string) => {
    const q = parseFloat(qtyStr) || 0;
    const c = parseFloat(costStr) || 0;
    return q * c;
  };

  // Calculate dynamic PO total
  const calculatedPOTotal = watchedItems.reduce((sum, item) => {
    return sum + calculateRowTotal(item.quantity, item.unitCost);
  }, 0);

  const canWrite = isAdmin || isStoreManager;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* --- LIST VIEW --- */}
        {viewMode === 'list' && (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Purchase Orders Registry</h2>
                <p className="text-sm text-slate-500">Track purchase workflow, approve bills, and receive incoming inventory stock.</p>
              </div>
              {canWrite && (
                <button
                  onClick={() => {
                    reset({ supplierId: '', items: [{ productId: '', quantity: '', unitCost: '' }] });
                    setViewMode('create');
                  }}
                  className="flex items-center space-x-1.5 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors"
                >
                  <PlusIcon className="h-5 w-5" />
                  <span>Create Purchase Order</span>
                </button>
              )}
            </div>

            {/* Table list */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {posLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              ) : purchaseOrders.length === 0 ? (
                <div className="p-16 text-center text-slate-400 text-sm">
                  No purchase orders found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">PO Number</th>
                        <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Supplier</th>
                        <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Total Cost</th>
                        <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {purchaseOrders.map((po) => (
                        <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-850">{po.poNumber}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{po.supplier.companyName}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{new Date(po.date).toLocaleDateString()}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-slate-800">{formatCurrency(po.totalCost)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              po.status === 'PAID'
                                ? 'bg-green-100 text-green-800'
                                : po.status === 'RECEIVED'
                                ? 'bg-blue-100 text-blue-800'
                                : po.status === 'APPROVED'
                                ? 'bg-indigo-100 text-indigo-800'
                                : po.status === 'CANCELLED'
                                ? 'bg-slate-100 text-slate-500 border border-slate-200'
                                : 'bg-amber-100 text-amber-800 animate-pulse'
                            }`}>
                              {po.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                            <button
                              onClick={() => {
                                setSelectedPO(po);
                                setViewMode('details');
                              }}
                              className="text-orange-500 hover:text-orange-600 hover:underline"
                            >
                              Manage PO
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* --- CREATOR VIEW --- */}
        {viewMode === 'create' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setViewMode('list')}
                className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors shadow-sm"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Draft Purchase Order</h3>
                <p className="text-xs text-slate-500">Configure products and quantities to request from suppliers.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
              {/* Select Supplier */}
              <div className="max-w-md">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Supplier Partner</label>
                <select
                  {...register('supplierId')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white font-medium"
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.companyName} ({s.name})
                    </option>
                  ))}
                </select>
                {errors.supplierId && <p className="text-xs text-red-500 mt-1">{errors.supplierId.message}</p>}
              </div>

              {/* Dynamic Items Array List */}
              <div className="space-y-4 border-t border-slate-100 pt-5">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-slate-700">Product Line Items</h4>
                  <button
                    type="button"
                    onClick={() => append({ productId: '', quantity: '', unitCost: '' })}
                    className="flex items-center space-x-1 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 transition-colors shadow-sm"
                  >
                    <PlusIcon className="h-4 w-4" />
                    <span>Add Line Row</span>
                  </button>
                </div>

                {errors.items?.message && (
                  <p className="text-xs text-red-500 font-semibold">{errors.items.message}</p>
                )}

                {/* Desktop Column Labels */}
                <div className="hidden sm:flex gap-3 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1">
                  <div className="flex-1">Product Name</div>
                  <div className="w-28">Quantity</div>
                  <div className="w-32">Unit Cost (GHS)</div>
                  <div className="w-32 text-right pr-2">Row Cost</div>
                  <div className="w-9" /> {/* spacer for action */}
                </div>

                <div className="space-y-3">
                  {fields.map((field, index) => {
                    const rowQty = watchedItems[index]?.quantity || '0';
                    const rowCost = watchedItems[index]?.unitCost || '0';
                    const rowTotal = calculateRowTotal(rowQty, rowCost);

                    return (
                      <div key={field.id} className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 relative group">
                        {/* Select Product */}
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5 sm:hidden">Product</label>
                          <select
                            {...register(`items.${index}.productId`)}
                            onChange={(e) => handleProductSelectChange(index, e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                          >
                            <option value="">Select Item</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.measurementUnit})
                              </option>
                            ))}
                          </select>
                          {errors.items?.[index]?.productId && (
                            <p className="text-xs text-red-500 mt-0.5">{errors.items[index]?.productId?.message}</p>
                          )}
                        </div>

                        {/* Quantity */}
                        <div className="w-full sm:w-28">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5 sm:hidden">Qty</label>
                          <input
                            type="number"
                            placeholder="Qty"
                            {...register(`items.${index}.quantity`)}
                            className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 font-semibold"
                          />
                          {errors.items?.[index]?.quantity && (
                            <p className="text-xs text-red-500 mt-0.5">{errors.items[index]?.quantity?.message}</p>
                          )}
                        </div>

                        {/* Unit Cost */}
                        <div className="w-full sm:w-32">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5 sm:hidden">Unit Cost (GHS)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Unit Cost"
                            {...register(`items.${index}.unitCost`)}
                            className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 font-semibold"
                          />
                          {errors.items?.[index]?.unitCost && (
                            <p className="text-xs text-red-500 mt-0.5">{errors.items[index]?.unitCost?.message}</p>
                          )}
                        </div>

                        {/* Row Total (Display) */}
                        <div className="w-full sm:w-32 pt-2 sm:pt-2.5 text-right font-bold text-slate-700 text-sm self-center sm:self-auto pr-2">
                          <span>GHS {rowTotal.toLocaleString()}</span>
                        </div>

                        {/* Delete Row Button */}
                        <div className="sm:self-center">
                          <button
                            type="button"
                            disabled={fields.length === 1}
                            onClick={() => remove(index)}
                            className="p-2 border border-transparent text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 transition-colors"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Summary & Submissions */}
              <div className="border-t border-slate-100 pt-5 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                <div className="text-slate-500 text-sm">
                  Calculated PO Cost Total: <span className="text-xl font-black text-slate-800 ml-1">GHS {calculatedPOTotal.toLocaleString()}</span>
                </div>

                <div className="flex space-x-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg shadow-sm"
                  >
                    Submit Purchase Order
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* --- DETAILS DETAILS VIEW --- */}
        {viewMode === 'details' && selectedPO && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setViewMode('list')}
                  className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors shadow-sm"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </button>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">PO Status Details ({selectedPO.poNumber})</h3>
                  <p className="text-xs text-slate-500 font-semibold text-slate-400">Supplier: {selectedPO.supplier.companyName}</p>
                </div>
              </div>

              {/* Status Operations */}
              <div className="flex flex-wrap gap-2 items-center">
                {selectedPO.status === 'PENDING' && isAdmin && (
                  <button
                    onClick={() => approveMutation.mutate(selectedPO.id)}
                    className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm"
                  >
                    <CheckIcon className="h-4.5 w-4.5" />
                    <span>Approve PO</span>
                  </button>
                )}

                {selectedPO.status === 'APPROVED' && canWrite && (
                  <button
                    onClick={() => receiveMutation.mutate(selectedPO.id)}
                    className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm"
                  >
                    <InboxArrowDownIcon className="h-4.5 w-4.5" />
                    <span>Receive Incoming Stock</span>
                  </button>
                )}

                {['PENDING', 'APPROVED'].includes(selectedPO.status) && canWrite && (
                  <button
                    onClick={() => cancelMutation.mutate(selectedPO.id)}
                    className="flex items-center space-x-1 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm"
                  >
                    <XMarkIcon className="h-4.5 w-4.5" />
                    <span>Cancel PO</span>
                  </button>
                )}
              </div>
            </div>

            {/* Content summary grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left card: PO meta details */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PO Status</span>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold mt-1 ${
                    selectedPO.status === 'PAID'
                      ? 'bg-green-100 text-green-800'
                      : selectedPO.status === 'RECEIVED'
                      ? 'bg-blue-100 text-blue-800'
                      : selectedPO.status === 'APPROVED'
                      ? 'bg-indigo-100 text-indigo-800'
                      : selectedPO.status === 'CANCELLED'
                      ? 'bg-slate-100 text-slate-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedPO.status}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total PO Cost</span>
                  <span className="text-lg font-black text-slate-800">{formatCurrency(selectedPO.totalCost)}</span>
                </div>

                <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 font-semibold space-y-2">
                  <p>Order Date: {new Date(selectedPO.date).toLocaleString()}</p>
                  <p>Vendor Address: {selectedPO.supplier.address}</p>
                </div>
              </div>

              {/* Right area: Product item rows */}
              <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 flex flex-col h-[320px]">
                <h4 className="text-sm font-bold text-slate-700 flex items-center space-x-1.5 pb-2 border-b border-slate-100">
                  <DocumentTextIcon className="h-5 w-5 text-slate-400" />
                  <span>Items Ordered ({selectedPO.items.length})</span>
                </h4>

                <div className="flex-1 overflow-y-auto border border-slate-100 rounded-lg">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Product</th>
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Qty</th>
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Cost Unit</th>
                        <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">Row Cost</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100 text-sm">
                      {selectedPO.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5 font-bold text-slate-850">{item.product.name}</td>
                          <td className="px-4 py-2.5 text-slate-600 font-semibold">{item.quantity} {item.product.measurementUnit}</td>
                          <td className="px-4 py-2.5 text-slate-500">GHS {item.unitCost}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-700">GHS {item.totalCost.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
