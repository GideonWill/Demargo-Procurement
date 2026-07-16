'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { io } from 'socket.io-client';
import ApiClient from '../services/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HomeIcon,
  ArchiveBoxIcon,
  UserGroupIcon,
  FolderIcon,
  ClipboardDocumentListIcon,
  BanknotesIcon,
  ChartBarIcon,
  ArrowRightOnRectangleIcon,
  BellIcon,
  Bars3Icon,
  XMarkIcon,
  UserIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

const API_SOCKET_URL = process.env.NEXT_PUBLIC_API_SOCKET_URL || 'http://localhost:5000';

interface Notification {
  id: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Fetch Notifications
  const { data: notifications = [], refetch: refetchNotifications } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => ApiClient.get('/notifications'),
    enabled: !!user,
  });

  // Mark single read mutation
  const readMutation = useMutation({
    mutationFn: (id: string) => ApiClient.put(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  // Mark all read mutation
  const readAllMutation = useMutation({
    mutationFn: () => ApiClient.put('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  // Real-time socket updates
  useEffect(() => {
    if (!user) return;

    const socket = io(API_SOCKET_URL);

    socket.on('connect', () => {
      console.log('Socket connected to backend');
    });

    socket.on('notification:new', (newNotification: Notification) => {
      queryClient.setQueryData(['notifications'], (old: Notification[] | undefined) => {
        if (!old) return [newNotification];
        return [newNotification, ...old];
      });
      // Optionally trigger desktop notification or custom alert sounds
    });

    socket.on('inventory:update', () => {
      // Reload relevant queries automatically
      queryClient.invalidateQueries();
    });

    return () => {
      socket.disconnect();
    };
  }, [user, queryClient]);

  // Swipe gestures to open/close mobile sidebar
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touchCurrentX = e.touches[0].clientX;
      const touchCurrentY = e.touches[0].clientY;

      const diffX = touchCurrentX - touchStartX;
      const diffY = touchCurrentY - touchStartY;

      if (!mobileSidebarOpen) {
        // SWIPE RIGHT (to open): Must originate near the left edge of the screen (within 50px)
        if (touchStartX <= 50 && diffX > 80 && Math.abs(diffY) < 40) {
          setMobileSidebarOpen(true);
        }
      } else {
        // SWIPE LEFT (to close): Can originate anywhere, swiping left
        if (diffX < -80 && Math.abs(diffY) < 40) {
          setMobileSidebarOpen(false);
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [mobileSidebarOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon, roles: ['ADMIN', 'STORE_MANAGER', 'FINANCE_OFFICER', 'MANAGEMENT_VIEWER'] },
    { name: 'Fabric & Blinds Stock', href: '/inventory', icon: ArchiveBoxIcon, roles: ['ADMIN', 'STORE_MANAGER', 'FINANCE_OFFICER', 'MANAGEMENT_VIEWER'] },
    { name: 'Suppliers Registry', href: '/suppliers', icon: UserGroupIcon, roles: ['ADMIN', 'STORE_MANAGER', 'FINANCE_OFFICER', 'MANAGEMENT_VIEWER'] },
    { name: 'Project Allocations', href: '/projects', icon: FolderIcon, roles: ['ADMIN', 'STORE_MANAGER', 'FINANCE_OFFICER', 'MANAGEMENT_VIEWER'] },
    { name: 'Purchase Orders', href: '/purchases', icon: ClipboardDocumentListIcon, roles: ['ADMIN', 'STORE_MANAGER', 'FINANCE_OFFICER', 'MANAGEMENT_VIEWER'] },
    { name: 'Payments Ledger', href: '/payments', icon: BanknotesIcon, roles: ['ADMIN', 'FINANCE_OFFICER', 'MANAGEMENT_VIEWER'] },
    { name: 'Reports & Audits', href: '/reports', icon: ChartBarIcon, roles: ['ADMIN', 'FINANCE_OFFICER', 'MANAGEMENT_VIEWER'] },
  ];

  const filteredNavigation = navigation.filter(
    (item) => user && item.roles.includes(user.role)
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* --- DESKTOP SIDEBAR --- */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64 bg-slate-900 border-r border-slate-800">
          {/* Brand/Logo Header */}
          <div className="flex items-center h-16 px-6 bg-slate-950 border-b border-slate-800">
            <span className="text-orange-500 font-extrabold text-lg tracking-wider uppercase">PROCUREMENT</span>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
            <nav className="flex-1 px-4 space-y-1 bg-slate-900">
              {filteredNavigation.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-orange-500 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon
                      className={`mr-3 h-5 w-5 ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'
                      }`}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User Account Quick View */}
          <div className="flex-shrink-0 flex border-t border-slate-800 p-4 bg-slate-950">
            <div className="flex items-center w-full">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-orange-500 text-white font-bold">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <div className="ml-3 flex-1 overflow-hidden">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs font-semibold text-slate-400 truncate">{user?.role.replace('_', ' ')}</p>
              </div>
              <button
                onClick={logout}
                className="ml-2 p-1.5 text-slate-400 hover:text-orange-500 rounded-lg hover:bg-slate-800 transition-colors"
                title="Log out"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- MOBILE SIDEBAR DRAWER --- */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileSidebarOpen(false)}
          />

          <div className="relative flex flex-col w-full max-w-xs bg-slate-900 border-r border-slate-800 animate-slide-in">
            {/* Close Button */}
            <div className="absolute top-2 right-2 p-1">
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="flex items-center justify-center h-10 w-10 rounded-full text-slate-300 hover:bg-slate-800"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="flex items-center h-16 px-6 bg-slate-950 border-b border-slate-800 flex-shrink-0">
              <span className="text-orange-500 font-extrabold text-lg tracking-wider font-mono uppercase">PROCUREMENT</span>
            </div>

            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <nav className="px-4 space-y-1">
                {filteredNavigation.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileSidebarOpen(false)}
                      className={`group flex items-center px-4 py-2.5 text-base font-medium rounded-lg ${
                        isActive
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <item.icon
                        className={`mr-4 h-6 w-6 ${isActive ? 'text-white' : 'text-slate-400'}`}
                        aria-hidden="true"
                      />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="flex-shrink-0 flex border-t border-slate-800 p-4 bg-slate-950">
              <div className="flex items-center w-full">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-500 text-white font-bold">
                  {user?.name.charAt(0).toUpperCase()}
                </div>
                <div className="ml-3 flex-1 overflow-hidden">
                  <p className="text-base font-medium text-white truncate">{user?.name}</p>
                  <p className="text-xs font-semibold text-slate-400 truncate">{user?.role.replace('_', ' ')}</p>
                </div>
                <button
                  onClick={logout}
                  className="ml-2 p-2 text-slate-400 hover:text-orange-500 rounded-lg hover:bg-slate-800"
                >
                  <ArrowRightOnRectangleIcon className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MAIN CONTENT CONTAINER --- */}
      <div className="flex flex-col flex-1 w-0 overflow-hidden">
        {/* Top Header Navigation */}
        <header className="relative flex-shrink-0 flex h-16 bg-white border-b border-slate-200">
          {/* Hamburger Menu Toggle (Mobile) */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="px-4 border-r border-slate-200 text-slate-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500 md:hidden"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>

          {/* Search Bar / Title */}
          <div className="flex-1 px-4 flex justify-between md:px-6">
            <div className="flex-1 flex items-center">
              <h1 className="text-lg md:text-xl font-bold text-slate-800 tracking-tight capitalize">
                {pathname.split('/')[1]?.replace('-', ' ') || 'Dashboard'}
              </h1>
            </div>

            {/* Notifications & Profile controls */}
            <div className="ml-4 flex items-center md:ml-6 space-x-4">
              {/* Notification Dropdown Trigger */}
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="p-1.5 rounded-full text-slate-500 hover:text-orange-500 hover:bg-slate-100 transition-colors relative"
                >
                  <span className="sr-only">View notifications</span>
                  <BellIcon className="h-6 w-6" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 block h-2.5 w-2.5 rounded-full bg-orange-600 ring-2 ring-white animate-pulse" />
                  )}
                </button>

                {/* Notifications Popup Dropdown */}
                {notificationsOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setNotificationsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-20 origin-top-right divide-y divide-slate-100 overflow-hidden">
                      <div className="px-4 py-2.5 flex items-center justify-between bg-slate-50">
                        <span className="text-sm font-semibold text-slate-800">Notifications ({unreadCount})</span>
                        {unreadCount > 0 && (
                          <button
                            onClick={() => readAllMutation.mutate()}
                            className="text-xs text-orange-500 hover:underline font-semibold"
                          >
                            Mark all read
                          </button>
                        )}
                      </div>

                      <div className="max-h-64 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="px-4 py-6 text-center text-sm text-slate-400">
                            No alerts or updates.
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <div
                              key={n.id}
                              className={`px-4 py-3 flex items-start space-x-3 transition-colors ${
                                !n.read ? 'bg-orange-50/50 hover:bg-orange-50' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex-1">
                                <p className={`text-xs text-slate-800 ${!n.read ? 'font-semibold' : ''}`}>
                                  {n.message}
                                </p>
                                <span className="text-[10px] text-slate-400 block mt-1" suppressHydrationWarning>
                                  {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {!n.read && (
                                <button
                                  onClick={() => readMutation.mutate(n.id)}
                                  className="text-slate-400 hover:text-orange-500 p-0.5 rounded"
                                  title="Mark as read"
                                >
                                  <CheckIcon className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* User Identity Banner (Desktop) */}
              <div className="hidden md:flex items-center space-x-2.5 border-l border-slate-200 pl-4">
                <div className="flex flex-col text-right">
                  <span className="text-sm font-bold text-slate-800 leading-none">{user?.name}</span>
                  <span className="text-[11px] font-semibold text-slate-400 leading-none mt-1">
                    {user?.role.replace('_', ' ')}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-sm border border-slate-300">
                  {user?.name.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Section */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
