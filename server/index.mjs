/**
 * API + estáticos. Node 18+ sem npm.
 * Dados: server/data/store.json (contas, OTP dev, sessões, avaliações; pedidos com km/valor opcionais; chat em orderMessages).
 * Pedidos: store.json por omissão; com USE_SQLITE=1 e Node 22.5+, SQLite em server/data/guiame.db (grátis).
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import {
  setDevOtp,
  registerCadastro,
  loginAccount,
  getSession,
  normalizePhone,
  addReview,
  listReviewsForTarget,
  listReviewsReceived,
  renovarBiometriaFacial,
  createPedido,
  listPedidos,
  aceitarPedido,
  pedidoFechamentoCliente,
  pedidoFechamentoPrestador,
  pedidoOrcamentoPrestador,
  listPedidoMensagens,
  postPedidoMensagem,
  getTaxaAceiteCotacao,
  getTaxaPrestadorFechamentoCotacao,
  uploadPedidoDocumentoFiscal,
  getPedidoDocumentoFiscal,
  listDocumentosFiscaisConta,
} from './store.mjs';
import { handleKycWebhookRequest } from './kyc.mjs';
import { sendTwilioOtpSms } from './sms.mjs';
import { initOrdersSqlite, ordersSqliteStatus } from './sqlite-orders.mjs';

await initOrdersSqlite();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Apps separados (cliente / prestador) + assets partilhados. */
const STATIC_REDIRECTS = new Map([
  ['/cliente.html', '/cliente/'],
  ['/prestador.html', '/prestador/'],
  ['/cadastro-cliente.html', '/cliente/cadastro.html'],
  ['/cadastro-prestador.html', '/prestador/cadastro.html'],
  ['/login.html', '/cliente/login.html'],
  ['/renovar-biometria.html', '/cliente/renovar-biometria.html'],
]);

const STATIC_MOUNTS = [
  { prefix: '/cliente', dir: path.join(ROOT, 'apps', 'cliente') },
  { prefix: '/prestador', dir: path.join(ROOT, 'apps', 'prestador') },
  { prefix: '/shared', dir: path.join(ROOT, 'shared') },
];

function resolveStaticPath(urlPath) {
  const redirect = STATIC_REDIRECTS.get(urlPath);
  if (redirect) return { redirect };

  for (const { prefix, dir } of STATIC_MOUNTS) {
    if (urlPath === prefix || urlPath === prefix + '/') {
      return { file: path.join(dir, 'index.html') };
    }
    if (urlPath.startsWith(prefix + '/')) {
      const rel = urlPath.slice(prefix.length + 1);
      if (!rel) return { file: path.join(dir, 'index.html') };
      const file = safeJoin(dir, rel);
      if (file) return { file };
    }
  }

  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  if (rel.endsWith('/')) rel += 'index.html';
  const file = safeJoin(ROOT, rel);
  return file ? { file } : null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.md': 'text/markdown; charset=utf-8',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function safeJoin(root, reqPath) {
  const clean = decodeURIComponent(reqPath.split('?')[0]).replace(/^\//, '');
  if (!clean || clean.includes('..')) return null;
  const full = path.resolve(root, clean);
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 2_000_000) reject(new Error('Body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function parseJson(raw) {
  if (!raw || !String(raw).trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('JSON inválido no corpo do pedido');
  }
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'POST' && url.pathname === '/api/sms/dev-send') {
    try {
      const raw = await readBody(req);
      const body = parseJson(raw);
      const phone = normalizePhone(body.celular);
      if (!phone || phone.length < 10) {
        json(res, 400, { ok: false, error: 'Celular inválido' });
        return;
      }
      const code = String(randomInt(100000, 999999));
      await setDevOtp(phone, code);
      console.log(`[SMS dev] ${phone} → código: ${code}`);

      let twilioHint = null;
      const tw = await sendTwilioOtpSms(phone, code);
      if (tw.sent) {
        console.log(`[SMS Twilio] enviado para +55${phone.slice(-11)}`);
        twilioHint = 'SMS enviado via Twilio.';
      } else if (tw.error) {
        console.warn('[SMS Twilio]', tw.error);
        twilioHint = `Twilio não enviou: ${tw.error}`;
      }

      const twilioConfigured = !!(
        process.env.TWILIO_ACCOUNT_SID?.trim() &&
        process.env.TWILIO_AUTH_TOKEN?.trim() &&
        process.env.TWILIO_FROM_NUMBER?.trim()
      );
      const hideDev = process.env.TWILIO_HIDE_DEVCODE === '1' || (twilioConfigured && tw.sent);

      json(res, 200, {
        ok: true,
        ...(hideDev ? {} : { devCode: code }),
        twilio: tw.sent ? 'sent' : tw.error ? 'error' : 'skipped',
        twilioHint,
        hint: hideDev
          ? 'Código enviado por SMS (Twilio). Não expor o código em JSON em produção.'
          : 'Produção com Twilio: defina TWILIO_* e opcionalmente TWILIO_HIDE_DEVCODE=1 para não devolver devCode.',
      });
    } catch (e) {
      json(res, 400, { ok: false, error: String(e?.message || e) });
    }
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/api/cadastro/cliente' || url.pathname === '/api/cadastro/prestador')) {
    try {
      const tipo = url.pathname.endsWith('/cliente') ? 'cliente' : 'prestador';
      const raw = await readBody(req);
      const payload = parseJson(raw);
      const { id } = await registerCadastro(tipo, payload);
      json(res, 200, { ok: true, id });
    } catch (e) {
      json(res, 400, { ok: false, error: String(e?.message || e) });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/kyc/webhook') {
    try {
      const raw = await readBody(req);
      const { status, body } = await handleKycWebhookRequest(raw, req.headers);
      json(res, status, body);
    } catch (e) {
      json(res, 400, { ok: false, error: String(e?.message || e) });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/biometria-renovar') {
    try {
      const auth = req.headers.authorization || '';
      const token = (auth.startsWith('Bearer ') ? auth.slice(7) : '')?.trim();
      if (!token) {
        json(res, 401, { ok: false, error: 'Token em falta — use Authorization: Bearer <token>' });
        return;
      }
      const raw = await readBody(req);
      const body = parseJson(raw);
      const out = await renovarBiometriaFacial(token, body);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      const msg = String(e?.message || e);
      const status = msg.includes('Sessão') ? 401 : 400;
      json(res, status, { ok: false, error: msg });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/pedidos') {
    try {
      const auth = req.headers.authorization || '';
      const token = (auth.startsWith('Bearer ') ? auth.slice(7) : '')?.trim();
      if (!token) {
        json(res, 401, { ok: false, error: 'Token em falta — faça login como cliente' });
        return;
      }
      const raw = await readBody(req);
      const body = parseJson(raw);
      const out = await createPedido(token, body);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      const msg = String(e?.message || e);
      const status = msg.includes('Sessão') ? 401 : 400;
      json(res, status, { ok: false, error: msg });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/pedidos') {
    const auth = req.headers.authorization || '';
    const token = (auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token'))?.trim();
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    try {
      const out = await listPedidos(token);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      json(res, 401, { ok: false, error: String(e?.message || e) });
    }
    return;
  }

  const pedidoAcao = req.method === 'POST' && url.pathname.match(/^\/api\/pedidos\/([0-9a-f-]{36})\/(aceitar|fechamento-cliente|fechamento-prestador|orcamento)$/i);
  if (pedidoAcao) {
    const auth = req.headers.authorization || '';
    const token = (auth.startsWith('Bearer ') ? auth.slice(7) : '')?.trim();
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    const pedidoId = pedidoAcao[1];
    const acao = String(pedidoAcao[2]).toLowerCase();
    try {
      let out;
      if (acao === 'orcamento') {
        const raw = await readBody(req);
        const body = parseJson(raw);
        out = await pedidoOrcamentoPrestador(token, pedidoId, body);
      } else if (acao === 'aceitar') out = await aceitarPedido(token, pedidoId);
      else if (acao === 'fechamento-cliente') out = await pedidoFechamentoCliente(token, pedidoId);
      else if (acao === 'fechamento-prestador') out = await pedidoFechamentoPrestador(token, pedidoId);
      else {
        json(res, 400, { ok: false, error: 'Ação inválida' });
        return;
      }
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      const msg = String(e?.message || e);
      const status = msg.includes('Sessão') ? 401 : 400;
      json(res, status, { ok: false, error: msg });
    }
    return;
  }

  const pedidoDocFiscal = url.pathname.match(/^\/api\/pedidos\/([0-9a-f-]{36})\/documento-fiscal$/i);
  if (pedidoDocFiscal) {
    const pedidoId = pedidoDocFiscal[1];
    const auth = req.headers.authorization || '';
    const token = (auth.startsWith('Bearer ') ? auth.slice(7) : '')?.trim();
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    if (req.method === 'GET') {
      try {
        const out = await getPedidoDocumentoFiscal(token, pedidoId);
        json(res, 200, { ok: true, ...out });
      } catch (e) {
        const msg = String(e?.message || e);
        const status = msg.includes('Sessão')
          ? 401
          : msg.includes('não encontrado') || msg.includes('Ainda não')
            ? 404
            : msg.includes('permissão')
              ? 403
              : 400;
        json(res, status, { ok: false, error: msg });
      }
      return;
    }
    if (req.method === 'POST') {
      try {
        const raw = await readBody(req);
        const body = parseJson(raw);
        const out = await uploadPedidoDocumentoFiscal(token, pedidoId, body);
        json(res, 200, { ok: true, ...out });
      } catch (e) {
        const msg = String(e?.message || e);
        const status = msg.includes('Sessão') ? 401 : 400;
        json(res, status, { ok: false, error: msg });
      }
      return;
    }
    json(res, 405, { ok: false, error: 'Método não permitido' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/conta/documentos-fiscais') {
    const auth = req.headers.authorization || '';
    const token = (auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token'))?.trim();
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    try {
      const out = await listDocumentosFiscaisConta(token);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      json(res, 401, { ok: false, error: String(e?.message || e) });
    }
    return;
  }

  const pedidoMensagens = url.pathname.match(/^\/api\/pedidos\/([0-9a-f-]{36})\/messages$/i);
  if (pedidoMensagens) {
    const pedidoId = pedidoMensagens[1];
    const auth = req.headers.authorization || '';
    const token = (auth.startsWith('Bearer ') ? auth.slice(7) : '')?.trim();
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    if (req.method === 'GET') {
      try {
        const out = await listPedidoMensagens(token, pedidoId);
        json(res, 200, { ok: true, ...out });
      } catch (e) {
        const msg = String(e?.message || e);
        const status = msg.includes('Sessão')
          ? 401
          : msg.includes('não encontrado')
            ? 404
            : msg.includes('permissão')
              ? 403
              : 400;
        json(res, status, { ok: false, error: msg });
      }
      return;
    }
    if (req.method === 'POST') {
      try {
        const raw = await readBody(req);
        const body = parseJson(raw);
        const out = await postPedidoMensagem(token, pedidoId, body);
        json(res, 200, { ok: true, ...out });
      } catch (e) {
        const msg = String(e?.message || e);
        const status = msg.includes('Sessão')
          ? 401
          : msg.includes('não encontrado')
            ? 404
            : msg.includes('permissão')
              ? 403
              : 400;
        json(res, status, { ok: false, error: msg });
      }
      return;
    }
    json(res, 405, { ok: false, error: 'Método não permitido' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const raw = await readBody(req);
      const body = parseJson(raw);
      const out = await loginAccount(body.celular, body.password);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      json(res, 401, { ok: false, error: String(e?.message || e) });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/avaliacoes') {
    try {
      const auth = req.headers.authorization || '';
      const token = (auth.startsWith('Bearer ') ? auth.slice(7) : '')?.trim();
      if (!token) {
        json(res, 401, { ok: false, error: 'Token em falta — use Authorization: Bearer <token>' });
        return;
      }
      const raw = await readBody(req);
      const body = parseJson(raw);
      const { id } = await addReview(token, body);
      json(res, 200, { ok: true, id });
    } catch (e) {
      const msg = String(e?.message || e);
      const status = msg.includes('Sessão') ? 401 : 400;
      json(res, status, { ok: false, error: msg });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/taxa-aceite/cotacao') {
    try {
      const kmParam = url.searchParams.get('km');
      const cotacao = await getTaxaAceiteCotacao(kmParam ?? undefined);
      json(res, 200, { ok: true, ...cotacao });
    } catch (e) {
      json(res, 500, { ok: false, error: String(e?.message || e) });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/taxa-prestador-fechamento/cotacao') {
    try {
      const cotacao = await getTaxaPrestadorFechamentoCotacao();
      json(res, 200, { ok: true, ...cotacao });
    } catch (e) {
      json(res, 500, { ok: false, error: String(e?.message || e) });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const auth = req.headers.authorization || '';
    const token = (auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token'))?.trim();
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    const me = await getSession(token);
    if (!me) {
      json(res, 401, { ok: false, error: 'Sessão inválida ou expirada' });
      return;
    }
    json(res, 200, { ok: true, ...me });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/avaliacoes/recebidas') {
    const auth = req.headers.authorization || '';
    const token = (auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token'))?.trim();
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    try {
      const lim = url.searchParams.get('limit');
      const out = await listReviewsReceived(token, lim ? Number(lim) : 50);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      json(res, 401, { ok: false, error: String(e?.message || e) });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/avaliacoes') {
    const tid = url.searchParams.get('target')?.trim();
    if (!tid) {
      json(res, 400, { ok: false, error: 'Parâmetro obrigatório: target=<id da conta>' });
      return;
    }
    try {
      const lim = url.searchParams.get('limit');
      const out = await listReviewsForTarget(tid, lim ? Number(lim) : 50);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      json(res, 400, { ok: false, error: String(e?.message || e) });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    const os = ordersSqliteStatus();
    json(res, 200, {
      ok: true,
      service: 'guia-me-service-api',
      store: 'server/data/store.json',
      pedidos: os.enabled ? { backend: 'sqlite', path: os.path } : { backend: 'json' },
      node: process.version,
    });
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  const urlPath = url.pathname === '' ? '/' : url.pathname;
  const resolved = resolveStaticPath(urlPath);
  if (!resolved) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  if (resolved.redirect) {
    res.writeHead(302, { Location: resolved.redirect });
    res.end();
    return;
  }

  const filePath = resolved.file;
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) {
    if (e.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(500);
      res.end('Server error');
    }
  }
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
      'Apps: /cliente/ · /prestador/ · portal /\n' +
      (_os.enabled ? `Pedidos: SQLite (${_os.path})\n` : 'Pedidos: JSON (store.orders)\n') +
      'POST /api/sms/dev-send | /api/cadastro/* | /api/pedidos | /api/pedidos/:id/messages | /api/pedidos/:id/aceitar | /api/pedidos/:id/orcamento | /api/pedidos/:id/fechamento-* | /api/auth/login | /api/auth/biometria-renovar | /api/kyc/webhook | /api/avaliacoes | ' +
      'GET /api/taxa-aceite/cotacao | GET /api/taxa-prestador-fechamento/cotacao | GET /api/conta/documentos-fiscais | GET /api/auth/me | GET /api/pedidos | GET /api/pedidos/:id/documento-fiscal | POST /api/pedidos/:id/documento-fiscal | GET /api/pedidos/:id/messages | GET /api/avaliacoes?target= | GET /api/avaliacoes/recebidas'
  );
});
