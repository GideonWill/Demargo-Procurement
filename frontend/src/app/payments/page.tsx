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
  BanknotesIcon,
  CreditCardIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

// Payment Zod validator schema
const paymentSchema = zod.object({
  purchaseOrderId: zod.string().min(1, 'Purchase Order ID is required'),
  amountPaid: zod.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, 'Amount paid must be a positive number'),
  paymentMethod: zod.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY']),
  invoiceNumber: zod.string().optional(),
  notes: zod.string().optional(),
});

type PaymentFormValues = zod.infer<typeof paymentSchema>;

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  totalCost: number;
  status: string;
  supplier: {
    name: string;
    companyName: string;
  };
  payments: {
    amountPaid: number;
  }[];
}

interface PaymentRecord {
  id: string;
  invoiceNumber: string;
  purchaseOrderId: string;
  supplierId: string;
  amountPaid: number;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'MOBILE_MONEY';
  paymentDate: string;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID';
  notes: string;
  supplier: {
    companyName: string;
  };
  purchaseOrder: {
    poNumber: string;
  };
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(val);
};

export default function PaymentsPage() {
  const { user, isAdmin, isFinanceOfficer } = useAuth();
  const queryClient = useQueryClient();

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forms setup
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { purchaseOrderId: '', paymentMethod: 'BANK_TRANSFER', invoiceNumber: '', notes: '' }
  });

  const watchedPOId = watch('purchaseOrderId');

  // Queries
  const { data: payments = [], isLoading: paymentsLoading } = useQuery<PaymentRecord[]>({
    queryKey: ['payments-ledger'],
    queryFn: () => ApiClient.get('/payments'),
  });

  // Fetch approved or received POs that require payment processing
  const { data: unpaidPOs = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ['unpaid-purchase-orders'],
    queryFn: async () => {
      const allPOs = await ApiClient.get('/purchases');
      // Filter out POs that are APPROVED or RECEIVED and not fully PAID
      return allPOs.filter(
        (po: any) => ['APPROVED', 'RECEIVED'].includes(po.status)
      );
    },
  });

  // Calculate remaining balance dynamically when PO selection changes
  React.useEffect(() => {
    if (watchedPOId) {
      const poObj = unpaidPOs.find((p) => p.id === watchedPOId);
      if (poObj) {
        setSelectedPO(poObj);
        const totalPaid = poObj.payments.reduce((sum, p) => sum + p.amountPaid, 0);
        const balance = Math.max(0, poObj.totalCost - totalPaid);
        setValue('amountPaid', balance.toString());
      }
    } else {
      setSelectedPO(null);
      setValue('amountPaid', '');
    }
  }, [watchedPOId, unpaidPOs, setValue]);

  // Mutations
  const recordMutation = useMutation({
    mutationFn: (data: any) => ApiClient.post('/payments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['unpaid-purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setPaymentModalOpen(false);
      reset();
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Payment execution failed.');
    }
  });

  const onSubmit = (values: PaymentFormValues) => {
    if (!selectedPO) return;
    
    const payload = {
      ...values,
      supplierId: selectedPO.supplierId,
      amountPaid: parseFloat(values.amountPaid),
    };

    recordMutation.mutate(payload);
  };

  const calculatePOBalance = (po: PurchaseOrder) => {
    const totalPaid = po.payments.reduce((sum, p) => sum + p.amountPaid, 0);
    return Math.max(0, po.totalCost - totalPaid);
  };

  const canWrite = isAdmin || isFinanceOfficer;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Payments Ledger</h2>
            <p className="text-sm text-slate-500">Record cash transactions, check balances, and view expenditure ledgers.</p>
          </div>
          {canWrite && (
            <button
              onClick={() => {
                reset();
                setPaymentModalOpen(true);
                setErrorMessage(null);
              }}
              className="flex items-center space-x-1.5 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors"
            >
              <PlusIcon className="h-5 w-5" />
              <span>Record Payment</span>
            </button>
          )}
        </div>

        {/* Payments Ledger List Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {paymentsLoading ? (
            <div className="h-64 flex items-center justify-center">
              <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : payments.length === 0 ? (
            <div className="p-16 text-center text-slate-400 text-sm">
              No payment transactions logged in database.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Invoice Number</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Supplier</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">PO Link</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Method</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Settlement Date</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Amount Paid</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800">{p.invoiceNumber}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{p.supplier?.companyName || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-500">{p.purchaseOrder?.poNumber || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {p.paymentMethod.replace('_', ' ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {new Date(p.paymentDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-green-600">{formatCurrency(p.amountPaid)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                          p.status === 'PAID' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {p.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* --- RECORD PAYMENT MODAL --- */}
        {paymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setPaymentModalOpen(false)} />
            
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full z-10 overflow-hidden animate-scale-up">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800">Record Settlement Invoice</h3>
                <button onClick={() => setPaymentModalOpen(false)} className="text-slate-400 hover:bg-slate-200 p-1 rounded-full">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {errorMessage && (
                <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-semibold rounded-lg">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
                {/* Select Unpaid PO */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Select Purchase Order</label>
                  <select
                    {...register('purchaseOrderId')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white font-medium"
                  >
                    <option value="">Select PO</option>
                    {unpaidPOs.map((po) => {
                      const balance = calculatePOBalance(po);
                      return (
                        <option key={po.id} value={po.id}>
                          {po.poNumber} - {po.supplier.companyName} (Balance: GHS {balance})
                        </option>
                      );
                    })}
                  </select>
                  {errors.purchaseOrderId && <p className="text-xs text-red-500 mt-1">{errors.purchaseOrderId.message}</p>}
                </div>

                {selectedPO && (
                  <div className="p-3 bg-orange-50 border border-orange-100 text-orange-800 text-xs rounded-lg font-medium space-y-0.5">
                    <p>Vendor: {selectedPO.supplier.companyName}</p>
                    <p>Invoice Total: GHS {selectedPO.totalCost}</p>
                  </div>
                )}

                {/* Amount Paid */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Amount to Settle (GHS)</label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('amountPaid')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 font-semibold"
                  />
                  {errors.amountPaid && <p className="text-xs text-red-500 mt-1">{errors.amountPaid.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Payment Method */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Payment Method</label>
                    <select
                      {...register('paymentMethod')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                    >
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="MOBILE_MONEY">Mobile Money</option>
                      <option value="CASH">Cash</option>
                      <option value="CHECK">Check</option>
                    </select>
                  </div>

                  {/* Invoice reference (optional) */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Invoice Reference</label>
                    <input
                      type="text"
                      {...register('invoiceNumber')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g. INV-1002"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Payment Notes</label>
                  <textarea
                    {...register('notes')}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Enter bank transaction ID or details..."
                  />
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setPaymentModalOpen(false)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg shadow-sm"
                  >
                    Post Payment
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
