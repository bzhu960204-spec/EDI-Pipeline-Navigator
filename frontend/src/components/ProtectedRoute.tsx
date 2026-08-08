import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, isAdmin } from '../features/auth/authStore';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin }: ProtectedRouteProps) {
  const location = useLocation();
  const { token, user } = useAuthStore();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (requireAdmin && !isAdmin(user)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
