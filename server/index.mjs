/**
 * Guia-me Service — entrada do backend.
 * API modular em server/api/ + dados em server/store.mjs.
 */
import http from 'node:http';
import { initOrdersSqlite, ordersSqliteStatus } from './sqlite-orders.mjs';
import { createRouter } from './lib/router.mjs';
import { cors } from './lib/http.mjs';
import { registerApiRoutes } from './api/register.mjs';
import { serveStatic } from './static.mjs';

await initOrdersSqlite();

const apiRouter = createRouter();
registerApiRoutes(apiRouter);

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    const handled = await apiRouter.dispatch(req, res, url);
    if (handled) return;
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Rota API não encontrada' }));
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  const urlPath = url.pathname === '' ? '/' : url.pathname;
  await serveStatic(req, res, urlPath);
});

const PORT = Number(process.env.PORT) || 3333;
const _os = ordersSqliteStatus();
server.listen(PORT, '0.0.0.0', () => {
  const base =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.PUBLIC_URL ||
    `http://localhost:${PORT}`;
  console.log(
    `Guia-me Service — ${base}\n` +
      'Backend: server/api/register.mjs\n' +
      'Apps: /cliente/ · /prestador/ · portal /\n' +
      (_os.enabled ? `Pedidos: SQLite (${_os.path})\n` : 'Pedidos: JSON (store.orders)\n') +
      'Health: GET /api/health'
  );
});
