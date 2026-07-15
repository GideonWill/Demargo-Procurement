'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ApiClient from '@/services/api';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as zod from 'zod';
import { useAuth } from '@/components/AuthContext';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  PencilIcon,
  TrashIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

// Validation schema for creating/editing products
const productSchema = zod.object({
  name: zod.string().min(1, 'Product name is required'),
  code: zod.string().optional(),
  categoryId: zod.string().min(1, 'Category is required'),
  supplierId: zod.string().min(1, 'Supplier is required'),
  purchasePrice: zod.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, 'Must be a non-negative number'),
  sellingPrice: zod.string().optional(),
  measurementUnit: zod.string().min(1, 'Unit of measurement is required (e.g. yards, pieces)'),
  subCategory: zod.string().optional(),
  description: zod.string().optional(),
  quantityAvailable: zod.string().optional().refine(val => !val || !isNaN(parseFloat(val)), 'Must be a valid number'),
  minStockLevel: zod.string().optional().refine(val => !val || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), 'Must be a non-negative number'),
});

type ProductFormValues = zod.infer<typeof productSchema>;

// Validation schema for stock adjustment
const adjustStockSchema = zod.object({
  quantityAvailable: zod.string().refine(val => !isNaN(parseFloat(val)), 'Must be a valid number'),
  reason: zod.string().min(3, 'A reason is required to log the stock movement'),
});

type AdjustStockValues = zod.infer<typeof adjustStockSchema>;

interface Category {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  subCategory: string;
  measurementUnit: string;
  quantityAvailable: number;
  minStockLevel: number;
  purchasePrice: number;
  sellingPrice: number;
  categoryId: string;
  supplierId: string;
  category: Category;
  supplier: Supplier;
  code?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function InventoryPage() {
  const { user, isAdmin, isStoreManager } = useAuth();
  const queryClient = useQueryClient();

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [isInternal, setIsInternal] = useState(false);

  // Queries
  const { data: products = [], isLoading: productsLoading, refetch: refetchProducts } = useQuery<Product[]>({
    queryKey: ['products', search, categoryFilter, statusFilter],
    queryFn: () => ApiClient.get(`/products?search=${search}&categoryId=${categoryFilter}&status=${statusFilter}`),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => ApiClient.get('/products/categories'),
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => ApiClient.get('/suppliers'),
  });

  // Forms setup
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
  });

  // Watch category selection to conditionally render Fabric Code input
  const watchedCategoryId = watch('categoryId');
  const isCurtainMaterialSelected = categories.find(c => c.id === watchedCategoryId)?.name === 'Curtain Materials';

  const {
    register: registerAdjust,
    handleSubmit: handleAdjustSubmit,
    reset: resetAdjust,
    setValue: setAdjustValue,
    formState: { errors: adjustErrors },
  } = useForm<AdjustStockValues>({
    resolver: zodResolver(adjustStockSchema),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => ApiClient.post('/products', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setProductModalOpen(false);
      reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => ApiClient.put(`/products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setProductModalOpen(false);
      setSelectedProduct(null);
      reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ApiClient.delete(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const adjustMutation = useMutation({
    mutationFn: ({ id, qty, reason }: { id: string; qty: number; reason: string }) =>
      ApiClient.put(`/products/${id}`, { quantityAvailable: qty, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setAdjustModalOpen(false);
      setSelectedProduct(null);
      resetAdjust();
    },
  });

  const onSubmit = (values: ProductFormValues) => {
    const payload = {
      ...values,
      code: isCurtainMaterialSelected ? (values.code || null) : null,
      purchasePrice: parseFloat(values.purchasePrice),
      sellingPrice: values.sellingPrice ? parseFloat(values.sellingPrice) : 0,
      quantityAvailable: isCurtainMaterialSelected ? 0 : (values.quantityAvailable ? parseFloat(values.quantityAvailable) : 0),
      minStockLevel: isCurtainMaterialSelected ? 0 : (values.minStockLevel ? parseFloat(values.minStockLevel) : 0),
    };

    if (selectedProduct) {
      updateMutation.mutate({ id: selectedProduct.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const onAdjustSubmit = (values: AdjustStockValues) => {
    if (!selectedProduct) return;
    adjustMutation.mutate({
      id: selectedProduct.id,
      qty: parseFloat(values.quantityAvailable),
      reason: values.reason,
    });
  };

  const openEditModal = (p: Product) => {
    setSelectedProduct(p);
    setIsInternal(p.sellingPrice === 0);
    setValue('name', p.name);
    setValue('code', p.code || '');
    setValue('categoryId', p.categoryId);
    setValue('supplierId', p.supplierId);
    setValue('purchasePrice', p.purchasePrice.toString());
    setValue('sellingPrice', p.sellingPrice.toString());
    setValue('measurementUnit', p.measurementUnit);
    setValue('subCategory', p.subCategory || '');
    setValue('description', p.description || '');
    setValue('quantityAvailable', p.quantityAvailable.toString());
    setValue('minStockLevel', p.minStockLevel.toString());
    setProductModalOpen(true);
  };

  const openAdjustModal = (p: Product) => {
    setSelectedProduct(p);
    setAdjustValue('quantityAvailable', p.quantityAvailable.toString());
    setAdjustValue('reason', '');
    setAdjustModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      deleteMutation.mutate(id);
    }
  };

  const canWrite = isAdmin || isStoreManager;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Inventory Registry</h2>
            <p className="text-sm text-slate-500">Curtain fabrics, blind types, automation accessories, and controllers.</p>
          </div>
          {canWrite && (
            <button
              onClick={() => {
                setSelectedProduct(null);
                setIsInternal(false);
                reset();
                setProductModalOpen(true);
              }}
              className="flex items-center space-x-1.5 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors"
            >
              <PlusIcon className="h-5 w-5" />
              <span>Add Product</span>
            </button>
          )}
        </div>

        {/* Filters and Search toolbar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center">
          {/* Search box */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <MagnifyingGlassIcon className="h-5 w-5" />
            </span>
            <input
              type="text"
              placeholder="Search by name, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 w-full rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
            />
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider hidden lg:inline">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Status Dropdown */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider hidden lg:inline">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">All Statuses</option>
              <option value="available">Available (In Stock)</option>
              <option value="low">Low Stock Warn</option>
              <option value="out">Out of Stock</option>
            </select>
          </div>
        </div>

        {/* Product Ledger Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {productsLoading ? (
            <div className="h-64 flex items-center justify-center">
              <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : products.length === 0 ? (
            <div className="p-16 text-center text-slate-400 text-sm">
              No products found matching your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Product Info</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Quantity</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Pricing</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Supplier</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Date Added</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {products.map((p) => {
                    const isOut = p.quantityAvailable === 0;
                    const isLow = p.quantityAvailable > 0 && p.quantityAvailable <= p.minStockLevel;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        {/* Name/Desc */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-800 flex items-center">
                              {p.code && (
                                <span className="bg-orange-50 text-orange-600 font-extrabold text-[10px] px-1.5 py-0.5 rounded border border-orange-100 mr-2 uppercase">
                                  {p.code}
                                </span>
                              )}
                              <span>{p.name}</span>
                            </span>
                            <span className="text-xs text-slate-400 truncate max-w-xs">{p.description || '-'}</span>
                          </div>
                        </td>

                        {/* Cat/SubCat */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm text-slate-700 font-medium">{p.category.name}</span>
                            <span className="text-xs text-slate-400">{p.subCategory || '-'}</span>
                          </div>
                        </td>

                        {/* Qty Available */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          {p.category.name === 'Curtain Materials' ? (
                            <div className="flex flex-col">
                              {p.quantityAvailable < 0 ? (
                                <>
                                  <span className="text-sm font-bold text-slate-500">
                                    0 {p.measurementUnit}
                                  </span>
                                  <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded-md text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 max-w-max">
                                    Shortage: {Math.abs(p.quantityAvailable)} {p.measurementUnit}
                                  </span>
                                </>
                              ) : (
                                <span className="text-sm font-bold text-slate-700">
                                  {p.quantityAvailable} {p.measurementUnit}
                                </span>
                              )}
                              <span className="text-xs text-slate-400">Project-demand based</span>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-700">
                                {p.quantityAvailable} {p.measurementUnit}
                              </span>
                              <span className="text-xs text-slate-400">Min limit: {p.minStockLevel}</span>
                            </div>
                          )}
                        </td>

                        {/* Prices */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col text-sm">
                            <span className="text-slate-500">Buy: <span className="font-semibold text-slate-700">GHS {p.purchasePrice}</span></span>
                            <span className="text-slate-500 font-medium">
                              Sell: {p.sellingPrice === 0 ? (
                                <span className="text-slate-400 font-bold italic">N/A (Internal)</span>
                              ) : (
                                <span className="font-bold text-orange-600">GHS {p.sellingPrice}</span>
                              )}
                            </span>
                          </div>
                        </td>

                        {/* Supplier */}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                          {p.supplier.name}
                        </td>

                        {/* Date Added */}
                        <td className="px-6 py-4 whitespace-nowrap" suppressHydrationWarning>
                          <div className="flex flex-col text-xs text-slate-500 font-semibold" suppressHydrationWarning>
                            <span suppressHydrationWarning>{new Date(p.createdAt).toLocaleDateString()}</span>
                            <span className="text-[10px] text-slate-400" suppressHydrationWarning>{new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            isOut
                              ? 'bg-red-100 text-red-800'
                              : isLow
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {isOut ? 'OUT OF STOCK' : isLow ? 'LOW STOCK' : 'AVAILABLE'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                          {canWrite && (
                            <>
                              <button
                                onClick={() => openAdjustModal(p)}
                                className="inline-flex p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Adjust Stock Quantity"
                              >
                                <AdjustmentsHorizontalIcon className="h-4.5 w-4.5" />
                              </button>
                              <button
                                onClick={() => openEditModal(p)}
                                className="inline-flex p-1.5 text-slate-400 hover:text-orange-500 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Edit Specifications"
                              >
                                <PencilIcon className="h-4.5 w-4.5" />
                              </button>
                            </>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="inline-flex p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Delete Product"
                            >
                              <TrashIcon className="h-4.5 w-4.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* --- ADD/EDIT PRODUCT MODAL --- */}
        {productModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setProductModalOpen(false)} />
            
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full z-10 overflow-hidden animate-scale-up">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800">
                  {selectedProduct ? `Edit product specifications` : 'Register new inventory product'}
                </h3>
                <button
                  onClick={() => setProductModalOpen(false)}
                  className="text-slate-400 hover:bg-slate-200 p-1 rounded-full"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                {/* Product Name & Code */}
                <div className="grid grid-cols-3 gap-4">
                  <div className={isCurtainMaterialSelected ? "col-span-2" : "col-span-3"}>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Product Name</label>
                    <input
                      type="text"
                      {...register('name')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g. 100% Blackout Curtain Fabric"
                    />
                    {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
                  </div>
                  {isCurtainMaterialSelected && (
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Fabric Code</label>
                      <input
                        type="text"
                        {...register('code')}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="e.g. FB-101"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Category */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Category</label>
                    <select
                      {...register('categoryId')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                    >
                      <option value="">Select Category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {errors.categoryId && <p className="text-xs text-red-500 mt-1">{errors.categoryId.message}</p>}
                  </div>

                  {/* Subcategory */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Subcategory / Type</label>
                    <input
                      type="text"
                      {...register('subCategory')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g. Voiles, Runners, Zebra Blinds"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Supplier */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Primary Supplier</label>
                    <select
                      {...register('supplierId')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                    >
                      <option value="">Select Supplier</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {errors.supplierId && <p className="text-xs text-red-500 mt-1">{errors.supplierId.message}</p>}
                  </div>

                  {/* Measurement Unit */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Unit of Measure</label>
                    <input
                      type="text"
                      {...register('measurementUnit')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g. yards, pieces, rolls"
                    />
                    {errors.measurementUnit && <p className="text-xs text-red-500 mt-1">{errors.measurementUnit.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Purchase Price */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Purchase Cost (GHS)</label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('purchasePrice')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="0.00"
                    />
                    {errors.purchasePrice && <p className="text-xs text-red-500 mt-1">{errors.purchasePrice.message}</p>}
                  </div>

                  {/* Selling Price */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Selling Price (GHS)</label>
                      <div className="flex items-center space-x-1">
                        <input
                          type="checkbox"
                          id="isInternalInput"
                          checked={isInternal}
                          onChange={(e) => {
                            setIsInternal(e.target.checked);
                            if (e.target.checked) {
                              setValue('sellingPrice', '0');
                            } else {
                              setValue('sellingPrice', '');
                            }
                          }}
                          className="h-3.5 w-3.5 text-orange-500 rounded border-slate-300 focus:ring-orange-500"
                        />
                        <label htmlFor="isInternalInput" className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer">Internal Use</label>
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      disabled={isInternal}
                      {...register('sellingPrice')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-400"
                      placeholder={isInternal ? 'N/A' : '0.00'}
                    />
                    {errors.sellingPrice && <p className="text-xs text-red-500 mt-1">{errors.sellingPrice.message}</p>}
                  </div>
                </div>

                {!selectedProduct && (
                  <div>
                    {!isCurtainMaterialSelected ? (
                      <div className="grid grid-cols-2 gap-4">
                        {/* Quantity Available */}
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Starting Stock Count</label>
                          <input
                            type="number"
                            {...register('quantityAvailable')}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="0"
                          />
                          {errors.quantityAvailable && <p className="text-xs text-red-500 mt-1">{errors.quantityAvailable.message}</p>}
                        </div>

                        {/* Min Stock level */}
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Min Threshold Level</label>
                          <input
                            type="number"
                            {...register('minStockLevel')}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="0"
                          />
                          {errors.minStockLevel && <p className="text-xs text-red-500 mt-1">{errors.minStockLevel.message}</p>}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-orange-50/50 border border-orange-100/50 rounded-xl p-3.5 text-xs text-slate-500">
                        💡 <strong className="text-slate-700">On-Demand Inventory:</strong> Curtain materials (fabrics & voiles) are ordered directly based on active project demands. They will start with 0 stock and require no minimum threshold.
                      </div>
                    )}
                  </div>
                )}

                {selectedProduct && !isCurtainMaterialSelected && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Min Threshold Level</label>
                    <input
                      type="number"
                      {...register('minStockLevel')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="0"
                    />
                    {errors.minStockLevel && <p className="text-xs text-red-500 mt-1">{errors.minStockLevel.message}</p>}
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Description</label>
                  <textarea
                    {...register('description')}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Provide optional notes about color, composition, size, etc."
                  />
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setProductModalOpen(false)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg shadow-sm"
                  >
                    {selectedProduct ? 'Save Changes' : 'Create Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* --- ADJUST STOCK MODAL --- */}
        {adjustModalOpen && selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setAdjustModalOpen(false)} />
            
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full z-10 overflow-hidden animate-scale-up">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800">
                  Adjust Inventory Stock
                </h3>
                <button
                  onClick={() => setAdjustModalOpen(false)}
                  className="text-slate-400 hover:bg-slate-200 p-1 rounded-full"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleAdjustSubmit(onAdjustSubmit)} className="p-6 space-y-4">
                <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg text-xs text-orange-800">
                  <p className="font-bold">Adjusting quantity for: {selectedProduct.name}</p>
                  <p className="mt-0.5">Current Stock: {selectedProduct.quantityAvailable} {selectedProduct.measurementUnit}</p>
                </div>

                {/* New Qty */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">New Total Quantity Available</label>
                  <div className="relative">
                    <input
                      type="number"
                      {...registerAdjust('quantityAvailable')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm font-semibold text-slate-400">
                      {selectedProduct.measurementUnit}
                    </span>
                  </div>
                  {adjustErrors.quantityAvailable && <p className="text-xs text-red-500 mt-1">{adjustErrors.quantityAvailable.message}</p>}
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Reason for Adjustment</label>
                  <textarea
                    {...registerAdjust('reason')}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g. Used 50 yards for East Legon Residence project, or received manual supply correction."
                  />
                  {adjustErrors.reason && <p className="text-xs text-red-500 mt-1">{adjustErrors.reason.message}</p>}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setAdjustModalOpen(false)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg shadow-sm"
                  >
                    Confirm Adjust
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
