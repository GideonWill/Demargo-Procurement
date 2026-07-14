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
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  ArrowLeftIcon,
  ClipboardDocumentListIcon,
  BanknotesIcon,
  TagIcon,
  ArrowPathIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

// Supplier Zod schema
const supplierSchema = zod.object({
  name: zod.string().min(1, 'Contact representative name is required'),
  companyName: zod.string().min(1, 'Company name is required'),
  phone: zod.string().min(5, 'Valid phone number is required'),
  email: zod.string().min(1, 'Email is required').email('Invalid email address'),
  address: zod.string().min(1, 'Company address is required'),
});

type SupplierFormValues = zod.infer<typeof supplierSchema>;

interface SupplierListEntry {
  id: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  address: string;
  productsSuppliedCount: number;
  productsList: string[];
  totalPurchases: number;
  totalPaid: number;
  outstandingBalance: number;
  createdAt: string;
}

interface SupplierProfile {
  id: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  address: string;
  totals: {
    totalPurchases: number;
    totalPaid: number;
    outstandingBalance: number;
  };
  products: any[];
  purchaseOrders: any[];
  payments: any[];
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(val);
};

export default function SuppliersPage() {
  const { user, isAdmin, isStoreManager } = useAuth();
  const queryClient = useQueryClient();

  // Active supplier profile view ID
  const [viewingSupplierId, setViewingSupplierId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'products' | 'purchases' | 'payments'>('products');

  // Modal open
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);

  // Form setup
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: '', companyName: '', phone: '', email: '', address: '' }
  });

  // Queries
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<SupplierListEntry[]>({
    queryKey: ['suppliers'],
    queryFn: () => ApiClient.get('/suppliers'),
  });

  const { data: profile, isLoading: profileLoading } = useQuery<SupplierProfile>({
    queryKey: ['supplier-profile', viewingSupplierId],
    queryFn: () => ApiClient.get(`/suppliers/${viewingSupplierId}`),
    enabled: !!viewingSupplierId,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: SupplierFormValues) => ApiClient.post('/suppliers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setSupplierModalOpen(false);
      reset();
    },
  });

  const onSubmit = (values: SupplierFormValues) => {
    createMutation.mutate(values);
  };

  const canWrite = isAdmin || isStoreManager;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* --- LIST VIEW --- */}
        {!viewingSupplierId && (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Suppliers Registry</h2>
                <p className="text-sm text-slate-500">Manage curtain fabrics & accessory vendor details and outstanding balances.</p>
              </div>
              {canWrite && (
                <button
                  onClick={() => {
                    reset();
                    setSupplierModalOpen(true);
                  }}
                  className="flex items-center space-x-1.5 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors"
                >
                  <PlusIcon className="h-5 w-5" />
                  <span>Register Supplier</span>
                </button>
              )}
            </div>

            {/* List */}
            {suppliersLoading ? (
              <div className="h-64 flex items-center justify-center">
                <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : suppliers.length === 0 ? (
              <div className="p-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                No suppliers registered. Click "Register Supplier" to add one.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {suppliers.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-all group"
                  >
                    {/* Header */}
                    <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                      <div className="overflow-hidden">
                        <h3 className="text-base font-bold text-slate-800 truncate">{s.companyName}</h3>
                        <p className="text-xs text-slate-400 font-semibold truncate">Rep: {s.name}</p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0">
                        {s.companyName.charAt(0).toUpperCase()}
                      </div>
                    </div>

                    {/* Middle details */}
                    <div className="p-5 space-y-3.5 flex-1">
                      <div className="space-y-2 text-xs text-slate-500">
                        <div className="flex items-center space-x-2">
                          <PhoneIcon className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-700">{s.phone}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <EnvelopeIcon className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="truncate block font-semibold text-slate-700">{s.email}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <MapPinIcon className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="truncate block font-medium">{s.address}</span>
                        </div>
                      </div>

                      {/* Cash totals summary */}
                      <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-center">
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Billed</span>
                          <span className="text-xs font-extrabold text-slate-700">{formatCurrency(s.totalPurchases)}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding</span>
                          <span className={`text-xs font-extrabold ${s.outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(s.outstandingBalance)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom button */}
                    <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 text-center">
                      <button
                        onClick={() => {
                          setViewingSupplierId(s.id);
                          setActiveTab('products');
                        }}
                        className="text-xs text-orange-500 font-bold hover:text-orange-600 tracking-wide uppercase inline-flex items-center space-x-1"
                      >
                        <span>View Details Ledger</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* --- PROFILE PROFILE VIEW --- */}
        {viewingSupplierId && (
          <div className="space-y-6">
            {/* Back header */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setViewingSupplierId(null)}
                className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors shadow-sm"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Supplier Ledger Details</h3>
                <p className="text-xs text-slate-500">Comprehensive trace records for POs, receipts, and invoices.</p>
              </div>
            </div>

            {profileLoading || !profile ? (
              <div className="h-96 flex items-center justify-center">
                <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Left Card: Supplier basic details and quick balance stats */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                  {/* Name banner */}
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-full bg-slate-900 text-white font-extrabold text-2xl flex items-center justify-center">
                      {profile.companyName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-800 leading-tight">{profile.companyName}</h4>
                      <span className="text-xs font-semibold text-slate-400">Rep: {profile.name}</span>
                    </div>
                  </div>

                  {/* Fields list */}
                  <div className="space-y-3.5 border-t border-b border-slate-100 py-5 text-sm text-slate-700">
                    <div className="flex items-center space-x-3">
                      <PhoneIcon className="h-5 w-5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-800">{profile.phone}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <EnvelopeIcon className="h-5 w-5 text-slate-400 shrink-0" />
                      <span className="truncate block font-semibold text-slate-800">{profile.email}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <MapPinIcon className="h-5 w-5 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-600">{profile.address}</span>
                    </div>
                  </div>

                  {/* Key Balances */}
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Purchased Cost</span>
                      <span className="text-lg font-extrabold text-slate-800">{formatCurrency(profile.totals.totalPurchases)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Payments Settled</span>
                      <span className="text-lg font-extrabold text-green-600">{formatCurrency(profile.totals.totalPaid)}</span>
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding Account Balance</span>
                      <span className={`text-xl font-black ${profile.totals.outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(profile.totals.outstandingBalance)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Area: Tabs list (supplied products, purchase orders, payments history) */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[480px]">
                  {/* Tabs header */}
                  <div className="flex bg-slate-50 border-b border-slate-200">
                    <button
                      onClick={() => setActiveTab('products')}
                      className={`flex-1 py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors inline-flex justify-center items-center space-x-2 ${
                        activeTab === 'products'
                          ? 'border-orange-500 text-orange-500 bg-white'
                          : 'border-transparent text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      <TagIcon className="h-4.5 w-4.5" />
                      <span>Products supplied ({profile.products.length})</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('purchases')}
                      className={`flex-1 py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors inline-flex justify-center items-center space-x-2 ${
                        activeTab === 'purchases'
                          ? 'border-orange-500 text-orange-500 bg-white'
                          : 'border-transparent text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      <ClipboardDocumentListIcon className="h-4.5 w-4.5" />
                      <span>Purchase History ({profile.purchaseOrders.length})</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('payments')}
                      className={`flex-1 py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors inline-flex justify-center items-center space-x-2 ${
                        activeTab === 'payments'
                          ? 'border-orange-500 text-orange-500 bg-white'
                          : 'border-transparent text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      <BanknotesIcon className="h-4.5 w-4.5" />
                      <span>Payment Records ({profile.payments.length})</span>
                    </button>
                  </div>

                  {/* Tab Body */}
                  <div className="p-6 flex-1 bg-white">
                    {/* Products Tab */}
                    {activeTab === 'products' && (
                      <div className="space-y-4">
                        {profile.products.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-10">No products linked to this supplier.</p>
                        ) : (
                          <div className="overflow-x-auto border border-slate-100 rounded-lg">
                            <table className="min-w-full divide-y divide-slate-200">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Product Name</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Category</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Current Stock</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Selling Price</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-slate-100 text-sm">
                                {profile.products.map((prod) => (
                                  <tr key={prod.id}>
                                    <td className="px-4 py-3 font-bold text-slate-800">{prod.name}</td>
                                    <td className="px-4 py-3 text-slate-500">{prod.category?.name || '-'}</td>
                                    <td className="px-4 py-3 text-slate-600 font-semibold">{prod.quantityAvailable} {prod.measurementUnit}</td>
                                    <td className="px-4 py-3 text-orange-600 font-bold">GHS {prod.sellingPrice}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Purchase History Tab */}
                    {activeTab === 'purchases' && (
                      <div className="space-y-4">
                        {profile.purchaseOrders.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-10">No purchase history logged.</p>
                        ) : (
                          <div className="overflow-x-auto border border-slate-100 rounded-lg">
                            <table className="min-w-full divide-y divide-slate-200">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">PO Number</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Date</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Total Amount</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Status</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-slate-100 text-sm">
                                {profile.purchaseOrders.map((po) => (
                                  <tr key={po.id}>
                                    <td className="px-4 py-3 font-bold text-slate-800">{po.poNumber}</td>
                                    <td className="px-4 py-3 text-slate-500">{new Date(po.date).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 text-slate-700 font-bold">GHS {po.totalCost.toLocaleString()}</td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                        po.status === 'PAID'
                                          ? 'bg-green-100 text-green-800'
                                          : po.status === 'RECEIVED'
                                          ? 'bg-blue-100 text-blue-800'
                                          : po.status === 'APPROVED'
                                          ? 'bg-indigo-100 text-indigo-800'
                                          : po.status === 'CANCELLED'
                                          ? 'bg-slate-100 text-slate-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}>
                                        {po.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Payments History Tab */}
                    {activeTab === 'payments' && (
                      <div className="space-y-4">
                        {profile.payments.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-10">No supplier payments recorded.</p>
                        ) : (
                          <div className="overflow-x-auto border border-slate-100 rounded-lg">
                            <table className="min-w-full divide-y divide-slate-200">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Invoice Number</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Payment Date</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Method</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Amount Paid</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-slate-100 text-sm">
                                {profile.payments.map((pay) => (
                                  <tr key={pay.id}>
                                    <td className="px-4 py-3 font-bold text-slate-800">{pay.invoiceNumber}</td>
                                    <td className="px-4 py-3 text-slate-500">{new Date(pay.paymentDate).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 text-slate-600 font-semibold">{pay.paymentMethod.replace('_', ' ')}</td>
                                    <td className="px-4 py-3 text-green-600 font-bold">GHS {pay.amountPaid.toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- REGISTER SUPPLIER MODAL --- */}
        {supplierModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSupplierModalOpen(false)} />
            
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full z-10 overflow-hidden animate-scale-up">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800">Register New Supplier</h3>
                <button
                  onClick={() => setSupplierModalOpen(false)}
                  className="text-slate-400 hover:bg-slate-200 p-1 rounded-full"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
                {/* Company Name */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Company Name</label>
                  <input
                    type="text"
                    {...register('companyName')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g. Royal Fabrics Ltd."
                  />
                  {errors.companyName && <p className="text-xs text-red-500 mt-1">{errors.companyName.message}</p>}
                </div>

                {/* Rep Name */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Contact Person Name</label>
                  <input
                    type="text"
                    {...register('name')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g. Gideon Addo"
                  />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Phone Number</label>
                    <input
                      type="text"
                      {...register('phone')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g. +23324000000"
                    />
                    {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Email Address</label>
                    <input
                      type="email"
                      {...register('email')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g. rep@royalfabrics.com"
                    />
                    {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Company Address</label>
                  <input
                    type="text"
                    {...register('address')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g. Spintex Road, Accra, Ghana"
                  />
                  {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address.message}</p>}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setSupplierModalOpen(false)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg shadow-sm"
                  >
                    Register
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
