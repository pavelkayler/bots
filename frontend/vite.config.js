import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backendHost = env.VITE_BACKEND_HOST || '127.0.0.1';
  const backendPort = Number(env.VITE_BACKEND_PORT || 3000);
  const backendTarget = `http://${backendHost}:${backendPort}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/ws': {
          target: backendTarget,
          ws: true,
          changeOrigin: true
        },
        '/healthz': {
          target: backendTarget,
          changeOrigin: true
        },
        '/version': {
          target: backendTarget,
          changeOrigin: true
        }
      }
    }
  };
});
