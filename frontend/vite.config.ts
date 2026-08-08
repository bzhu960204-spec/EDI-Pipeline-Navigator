import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  // Ports are injected by start-dev.ps1; fall back to defaults for plain `npm run dev`.
  const backendPort = process.env.BACKEND_PORT ?? process.env.VITE_BACKEND_PORT ?? '8080';
  const frontendPort = process.env.FRONTEND_PORT ?? '5173';
  const backendTarget = `http://localhost:${backendPort}`;

  console.log(`[vite] Proxy /api -> ${backendTarget}`);

  return {
    plugins: [react()],
    server: {
      port: parseInt(frontendPort, 10),
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
