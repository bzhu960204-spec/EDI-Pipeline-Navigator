import axios from 'axios';
import { useAuthStore } from '../features/auth/authStore';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const { token, clear } = useAuthStore.getState();
      // Only force logout if we had a token (i.e. it expired/was rejected).
      if (token) {
        clear();
        if (window.location.pathname !== '/login') {
          // Flag read (and cleared) by LoginPage to explain the forced sign-out.
          sessionStorage.setItem('edinav-session-expired', '1');
          window.location.assign('/login');
        }
      }
    }
    return Promise.reject(error);
  },
);

export function extractErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { message?: string } | undefined)?.message ?? error.message ?? fallback;
  }
  return fallback;
}
