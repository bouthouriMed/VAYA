import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest, clearSession, getStoredAdmin, getStoredToken, storeSession } from '../api/client';
import type { AdminSession } from '../api/types';

interface AuthContextValue {
  admin: AdminSession | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loginError: string | null;
  isLoggingIn: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [admin, setAdmin] = useState<AdminSession | null>(() =>
    getStoredToken() ? getStoredAdmin<AdminSession>() : null,
  );
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    function handleUnauthorized(): void {
      clearSession();
      setAdmin(null);
    }
    window.addEventListener('vaya-admin:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('vaya-admin:unauthorized', handleUnauthorized);
  }, []);

  async function login(email: string, password: string): Promise<void> {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await apiRequest<{ accessToken: string; admin: AdminSession }>('/admin/login', {
        method: 'POST',
        body: { email, password },
      });
      storeSession(result.accessToken, result.admin);
      setAdmin(result.admin);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  }

  function logout(): void {
    clearSession();
    setAdmin(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({ admin, isAuthenticated: admin !== null, login, logout, loginError, isLoggingIn }),
    [admin, loginError, isLoggingIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
