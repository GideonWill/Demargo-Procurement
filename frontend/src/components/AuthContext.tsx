'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import ApiClient from '../services/api';

export type UserRole = 'ADMIN' | 'STORE_MANAGER' | 'FINANCE_OFFICER' | 'MANAGEMENT_VIEWER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  isAdmin: boolean;
  isStoreManager: boolean;
  isFinanceOfficer: boolean;
  isManagementViewer: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedUser = localStorage.getItem('user');
        const tokens = ApiClient.getTokens();

        if (storedUser && tokens.accessToken) {
          setUser(JSON.parse(storedUser));
          
          // Proactively fetch updated profile from server
          try {
            const freshUser = await ApiClient.get('/auth/profile');
            setUser(freshUser);
            localStorage.setItem('user', JSON.stringify(freshUser));
          } catch (e) {
            console.error('Failed to refresh user profile from server:', e);
          }
        }
      } catch (err) {
        console.error('Error restoring session:', err);
        ApiClient.clearTokens();
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Redirect to login if unauthenticated (exclude login page itself)
  useEffect(() => {
    if (!loading) {
      const tokens = ApiClient.getTokens();
      if (!tokens.accessToken && pathname !== '/login') {
        router.push('/login');
      } else if (tokens.accessToken && pathname === '/login') {
        router.push('/dashboard');
      }
    }
  }, [user, loading, pathname, router]);

  const login = async (email: string, password: string): Promise<User> => {
    try {
      const data = await ApiClient.post('/auth/login', { email, password });
      ApiClient.setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/dashboard');
      return data.user;
    } catch (error: any) {
      throw new Error(error.message || 'Login failed');
    }
  };

  const logout = () => {
    ApiClient.clearTokens();
    setUser(null);
    router.push('/login');
  };

  const isAdmin = user?.role === 'ADMIN';
  const isStoreManager = user?.role === 'STORE_MANAGER';
  const isFinanceOfficer = user?.role === 'FINANCE_OFFICER';
  const isManagementViewer = user?.role === 'MANAGEMENT_VIEWER';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAdmin,
        isStoreManager,
        isFinanceOfficer,
        isManagementViewer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
