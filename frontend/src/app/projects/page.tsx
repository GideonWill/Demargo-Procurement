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
  FolderIcon,
  MapPinIcon,
  TagIcon,
  CalendarDaysIcon,
  ArrowLeftIcon,
  TrashIcon,
  InboxStackIcon,
  CheckIcon,
  SparklesIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

// Project Zod validation schemas
const projectSchema = zod.object({
  clientName: zod.string().min(1, 'Client name is required'),
  location: zod.string().min(1, 'Project location is required'),
  projectType: zod.string().min(1, 'Project type is required (e.g. Residential, Office)'),
  startDate: zod.string().min(1, 'Start date is required'),
  status: zod.enum(['PLANNING', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED']),
});

type ProjectFormValues = zod.infer<typeof projectSchema>;

// Material Allocation Zod schema
const allocationSchema = zod.object({
  productId: zod.string().min(1, 'Product is required'),
  quantity: zod.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, 'Must be a positive quantity'),
});

type AllocationFormValues = zod.infer<typeof allocationSchema>;

interface Product {
  id: string;
  name: string;
  quantityAvailable: number;
  measurementUnit: string;
}

interface ProjectMaterial {
  id: string;
  productId: string;
  qtyReserved: number;
  isConsumed: boolean;
  createdAt: string;
  product: {
    name: string;
    measurementUnit: string;
  };
}

interface Project {
  id: string;
  clientName: string;
  location: string;
  projectType: string;
  startDate: string;
  status: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  materials: ProjectMaterial[];
}

export default function ProjectsPage() {
  const { user, isAdmin, isStoreManager } = useAuth();
  const queryClient = useQueryClient();

  // Active project profile view ID
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);

  // Modals state
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [allocateModalOpen, setAllocateModalOpen] = useState(false);

  // Checkboxes for material consumption
  const [selectedMaterialsToConsume, setSelectedMaterialsToConsume] = useState<string[]>([]);

  // Forms setup
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: { clientName: '', location: '', projectType: '', status: 'PLANNING' }
  });

  const {
    register: registerAlloc,
    handleSubmit: handleAllocSubmit,
    reset: resetAlloc,
    formState: { errors: allocErrors },
  } = useForm<AllocationFormValues>({
    resolver: zodResolver(allocationSchema),
    defaultValues: { productId: '', quantity: '' }
  });

  // Queries
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => ApiClient.get('/projects'),
  });

  const { data: projectProfile, isLoading: profileLoading } = useQuery<Project>({
    queryKey: ['project-profile', viewingProjectId],
    queryFn: () => ApiClient.get(`/projects/${viewingProjectId}`),
    enabled: !!viewingProjectId,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-for-alloc'],
    queryFn: () => ApiClient.get('/products'),
  });

  // Mutations
  const createProjectMutation = useMutation({
    mutationFn: (data: ProjectFormValues) => ApiClient.post('/projects', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setProjectModalOpen(false);
      reset();
    },
  });

  const allocateMutation = useMutation({
    mutationFn: (data: { productId: string; quantity: number }) =>
      ApiClient.post(`/projects/${viewingProjectId}/allocate`, {
        materials: [{ productId: data.productId, quantity: data.quantity }],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-profile', viewingProjectId] });
      queryClient.invalidateQueries({ queryKey: ['products-for-alloc'] });
      setAllocateModalOpen(false);
      resetAlloc();
    },
    onError: (err: any) => {
      alert(err.message || 'Allocation failed');
    }
  });

  const consumeMutation = useMutation({
    mutationFn: (ids: string[]) =>
      ApiClient.post(`/projects/${viewingProjectId}/consume`, { materialIds: ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-profile', viewingProjectId] });
      setSelectedMaterialsToConsume([]);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => ApiClient.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setViewingProjectId(null);
    },
  });

  const onSubmit = (values: ProjectFormValues) => {
    createProjectMutation.mutate(values);
  };

  const onAllocSubmit = (values: AllocationFormValues) => {
    allocateMutation.mutate({
      productId: values.productId,
      quantity: parseFloat(values.quantity),
    });
  };

  const handleToggleMaterialSelect = (id: string) => {
    setSelectedMaterialsToConsume((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleConsumeSelected = () => {
    if (selectedMaterialsToConsume.length === 0) return;
    if (confirm('Mark selected materials as physically consumed in this project?')) {
      consumeMutation.mutate(selectedMaterialsToConsume);
    }
  };

  const handleDeleteProject = (id: string) => {
    if (confirm('WARNING: Deleting this project will return all unconsumed reserved material stock back to inventory. Proceed?')) {
      deleteProjectMutation.mutate(id);
    }
  };

  const canWrite = isAdmin || isStoreManager;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* --- LIST VIEW --- */}
        {!viewingProjectId && (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Project Material Allocation</h2>
                <p className="text-sm text-slate-500">Track and reserve fabric/runners inventory assigned to active client interior projects.</p>
              </div>
              {canWrite && (
                <button
                  onClick={() => {
                    reset();
                    setProjectModalOpen(true);
                  }}
                  className="flex items-center space-x-1.5 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors"
                >
                  <PlusIcon className="h-5 w-5" />
                  <span>New Project</span>
                </button>
              )}
            </div>

            {/* Grid */}
            {projectsLoading ? (
              <div className="h-64 flex items-center justify-center">
                <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : projects.length === 0 ? (
              <div className="p-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                No active projects registered. Click "New Project" to start tracking.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((p) => {
                  const unconsumedCount = p.materials.filter((m) => !m.isConsumed).length;
                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-all"
                    >
                      {/* Header details */}
                      <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
                        <div className="overflow-hidden">
                          <h3 className="text-base font-bold text-slate-800 truncate">{p.clientName}</h3>
                          <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-200 px-1.5 py-0.5 rounded">
                            {p.projectType}
                          </span>
                        </div>
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-800'
                            : p.status === 'IN_PROGRESS'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {p.status.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Middle Location / dates */}
                      <div className="p-5 space-y-4 flex-1">
                        <div className="space-y-2 text-xs text-slate-500 font-semibold">
                          <div className="flex items-center space-x-2">
                            <MapPinIcon className="h-4 w-4 text-slate-400" />
                            <span>{p.location}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <CalendarDaysIcon className="h-4 w-4 text-slate-400" />
                            <span>Started: {new Date(p.startDate).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-400">
                          <span>Reserved items:</span>
                          <span className="text-slate-700 bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-extrabold text-sm">
                            {unconsumedCount} pending
                          </span>
                        </div>
                      </div>

                      {/* Bottom action */}
                      <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 text-center">
                        <button
                          onClick={() => setViewingProjectId(p.id)}
                          className="text-xs text-orange-500 font-bold hover:text-orange-600 tracking-wide uppercase"
                        >
                          Manage Material Allocations
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* --- PROFILE DETAIL VIEW --- */}
        {viewingProjectId && (
          <div className="space-y-6">
            {/* Header toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setViewingProjectId(null)}
                  className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors shadow-sm"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </button>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Project Allocation Details</h3>
                  <p className="text-xs text-slate-500">Configure stocks reserved and mark physically consumed items.</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {canWrite && (
                  <button
                    onClick={() => setAllocateModalOpen(true)}
                    className="flex items-center space-x-1 bg-orange-500 hover:bg-orange-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm"
                  >
                    <PlusIcon className="h-4.5 w-4.5" />
                    <span>Reserve Material</span>
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteProject(viewingProjectId)}
                    className="flex items-center space-x-1 bg-red-50 hover:bg-red-100 text-red-600 px-3.5 py-2 rounded-lg border border-red-200 text-xs font-bold"
                  >
                    <TrashIcon className="h-4.5 w-4.5" />
                    <span>Delete Project</span>
                  </button>
                )}
              </div>
            </div>

            {profileLoading || !projectProfile ? (
              <div className="h-96 flex items-center justify-center">
                <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Profile Overview Card */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Client Identity</span>
                    <span className="text-lg font-black text-slate-800">{projectProfile.clientName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Location Site</span>
                    <span className="text-sm font-semibold text-slate-700">{projectProfile.location}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Project Type</span>
                      <span className="text-xs font-bold text-slate-700">{projectProfile.projectType}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Status</span>
                      <span className="text-xs font-bold text-slate-700">{projectProfile.status}</span>
                    </div>
                  </div>
                </div>

                {/* Materials Ledger Card */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[380px]">
                  <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Reserved Materials Checklist</h4>
                      <p className="text-xs text-slate-400">Inventory counts currently earmarked for this construction site.</p>
                    </div>
                    {selectedMaterialsToConsume.length > 0 && canWrite && (
                      <button
                        onClick={handleConsumeSelected}
                        className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
                      >
                        <CheckIcon className="h-4 w-4" />
                        <span>Consume Selected ({selectedMaterialsToConsume.length})</span>
                      </button>
                    )}
                  </div>

                  <div className="flex-1 p-6">
                    {projectProfile.materials.length === 0 ? (
                      <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-sm">
                        <InboxStackIcon className="h-10 w-10 text-slate-300 mb-2" />
                        <span>No materials reserved for this project yet.</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50">
                            <tr>
                              {canWrite && <th className="px-4 py-2.5 w-10 text-left" />}
                              <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Material Name</th>
                              <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Reserved Qty</th>
                              <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100 text-sm">
                            {projectProfile.materials.map((mat) => (
                              <tr key={mat.id} className="hover:bg-slate-50 transition-colors">
                                {canWrite && (
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    {!mat.isConsumed ? (
                                      <input
                                        type="checkbox"
                                        checked={selectedMaterialsToConsume.includes(mat.id)}
                                        onChange={() => handleToggleMaterialSelect(mat.id)}
                                        className="h-4 w-4 text-orange-500 rounded border-slate-300 focus:ring-orange-500"
                                      />
                                    ) : (
                                      <div className="h-4 w-4" />
                                    )}
                                  </td>
                                )}
                                <td className="px-4 py-3 font-bold text-slate-800">{mat.product.name}</td>
                                <td className="px-4 py-3 text-slate-700 font-semibold">
                                  {mat.qtyReserved} {mat.product.measurementUnit}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                    mat.isConsumed ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-orange-800'
                                  }`}>
                                    {mat.isConsumed ? 'CONSUMED' : 'RESERVED (IN STOCK)'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- CREATE PROJECT MODAL --- */}
        {projectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setProjectModalOpen(false)} />
            
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full z-10 overflow-hidden animate-scale-up">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800">Track New Interior Project</h3>
                <button onClick={() => setProjectModalOpen(false)} className="text-slate-400 hover:bg-slate-200 p-1 rounded-full">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
                {/* Client Name */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Client Name</label>
                  <input
                    type="text"
                    {...register('clientName')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g. Villagio Apartment Suite"
                  />
                  {errors.clientName && <p className="text-xs text-red-500 mt-1">{errors.clientName.message}</p>}
                </div>

                {/* Location */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Project Location</label>
                  <input
                    type="text"
                    {...register('location')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g. East Legon, Accra"
                  />
                  {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Type */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Project Type</label>
                    <input
                      type="text"
                      {...register('projectType')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="e.g. Residential, Hotel"
                    />
                    {errors.projectType && <p className="text-xs text-red-500 mt-1">{errors.projectType.message}</p>}
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Status</label>
                    <select
                      {...register('status')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                    >
                      <option value="PLANNING">Planning</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="ON_HOLD">On Hold</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    {...register('startDate')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate.message}</p>}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setProjectModalOpen(false)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg shadow-sm"
                  >
                    Track Project
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* --- ALLOCATE MATERIAL MODAL --- */}
        {allocateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setAllocateModalOpen(false)} />
            
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full z-10 overflow-hidden animate-scale-up">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800">Reserve Product Stock</h3>
                <button onClick={() => setAllocateModalOpen(false)} className="text-slate-400 hover:bg-slate-200 p-1 rounded-full">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleAllocSubmit(onAllocSubmit)} className="p-6 space-y-4">
                {/* Select Product */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Select Product</label>
                  <select
                    {...registerAlloc('productId')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    <option value="">Select Item</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Avail: {p.quantityAvailable} {p.measurementUnit})
                      </option>
                    ))}
                  </select>
                  {allocErrors.productId && <p className="text-xs text-red-500 mt-1">{allocErrors.productId.message}</p>}
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Quantity to Reserve</label>
                  <input
                    type="number"
                    step="0.1"
                    {...registerAlloc('quantity')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Enter quantity"
                  />
                  {allocErrors.quantity && <p className="text-xs text-red-500 mt-1">{allocErrors.quantity.message}</p>}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setAllocateModalOpen(false)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg shadow-sm"
                  >
                    Confirm Reservation
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
