import express from 'express';
import path from 'node:path';

export function createHttpServer({ env, bot }) {
  const app = express();
  app.use(express.json());

  app.get('/healthz', (_req, res) => res.json({ ok: true, version: '1.0.0', uptimeSec: Number(process.uptime().toFixed(1)) }));
  app.get('/version', (_req, res) => res.json({ version: '1.0.0', mode: env.TRADING_MODE }));
  app.get('/ws-info', (_req, res) => res.json({ wsPath: env.WS_PATH, httpPort: env.PORT, env: env.NODE_ENV, now: Date.now() }));

  if (env.NODE_ENV === 'production') {
    const dist = path.resolve(process.cwd(), '../frontend/dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  return app;
}
