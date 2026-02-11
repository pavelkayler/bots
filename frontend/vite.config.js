import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = Number(env.BACKEND_PORT || env.PORT || 3000);
  const backendTarget = `http://localhost:${backendPort}`;
  const wsPath = env.WS_PATH || '/ws';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        [wsPath]: {
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
