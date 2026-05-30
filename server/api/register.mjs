/**
 * Registo de todas as rotas REST do Guia-me Service.
 */
import { randomInt } from 'node:crypto';
import {
  setDevOtp,
  registerCadastro,
  loginAccount,
  loginWithGoogle,
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
  getPrestadorVisibilidadeCotacao,
  uploadPedidoDocumentoFiscal,
  getPedidoDocumentoFiscal,
  listDocumentosFiscaisConta,
  listTransacoesAdmin,
  listRecentPortalReviews,
} from '../store.mjs';
import { assertAdminKey } from '../admin-auth.mjs';
import { handleKycWebhookRequest } from '../kyc.mjs';
import { sendTwilioOtpSms } from '../sms.mjs';
import { ordersSqliteStatus } from '../sqlite-orders.mjs';
import { getGoogleClientId, verifyGoogleIdToken } from '../google-auth.mjs';
import { readBody, json, parseJson, getBearerToken, sessionErrorStatus } from '../lib/http.mjs';

const PEDIDO_ID = '[0-9a-f-]{36}';

export function registerApiRoutes(router) {
  router.get('/api/admin/transacoes', async ({ req, res, url }) => {
    try {
      const key =
        url.searchParams.get('key')?.trim() ||
        String(req.headers['x-admin-key'] || '').trim();
      assertAdminKey(key);
      const out = await listTransacoesAdmin();
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      const msg = String(e?.message || e);
      const status = msg.includes('administrador') ? 401 : 500;
      json(res, status, { ok: false, error: msg });
    }
  });

  router.get('/api/health', async ({ res }) => {
    const os = ordersSqliteStatus();
    json(res, 200, {
      ok: true,
      service: 'guia-me-service-api',
      store: 'server/data/store.json',
      pedidos: os.enabled ? { backend: 'sqlite', path: os.path } : { backend: 'json' },
      node: process.version,
    });
  });

  router.post('/api/sms/dev-send', async ({ req, res }) => {
    try {
      const body = parseJson(await readBody(req));
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
  });

  router.post(/^\/api\/cadastro\/(cliente|prestador)$/, async ({ req, res, match }) => {
    try {
      const tipo = match[1];
      const payload = parseJson(await readBody(req));
      const { id } = await registerCadastro(tipo, payload);
      json(res, 200, { ok: true, id });
    } catch (e) {
      json(res, 400, { ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/api/kyc/webhook', async ({ req, res }) => {
    try {
      const raw = await readBody(req);
      const { status, body } = await handleKycWebhookRequest(raw, req.headers);
      json(res, status, body);
    } catch (e) {
      json(res, 400, { ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/api/auth/login', async ({ req, res }) => {
    try {
      const body = parseJson(await readBody(req));
      const out = await loginAccount(body.celular, body.password);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      json(res, 401, { ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/api/auth/google-config', async ({ res }) => {
    const clientId = getGoogleClientId();
    json(res, 200, { ok: true, enabled: !!clientId, clientId: clientId || null });
  });

  router.post('/api/auth/google', async ({ req, res }) => {
    try {
      const body = parseJson(await readBody(req));
      const tipo = body.tipo === 'prestador' ? 'prestador' : 'cliente';
      const profile = await verifyGoogleIdToken(body.credential || body.id_token);
      const out = await loginWithGoogle(tipo, profile);
      json(res, 200, { ok: true, ...out, provider: 'google' });
    } catch (e) {
      json(res, 401, { ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/api/auth/me', async ({ req, res, url }) => {
    const token = getBearerToken(req, url);
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
  });

  router.post('/api/auth/biometria-renovar', async ({ req, res }) => {
    try {
      const token = getBearerToken(req);
      if (!token) {
        json(res, 401, { ok: false, error: 'Token em falta — use Authorization: Bearer <token>' });
        return;
      }
      const body = parseJson(await readBody(req));
      const out = await renovarBiometriaFacial(token, body);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      const msg = String(e?.message || e);
      json(res, sessionErrorStatus(msg), { ok: false, error: msg });
    }
  });

  router.post('/api/pedidos', async ({ req, res }) => {
    try {
      const token = getBearerToken(req);
      if (!token) {
        json(res, 401, { ok: false, error: 'Token em falta — faça login como cliente' });
        return;
      }
      const body = parseJson(await readBody(req));
      const out = await createPedido(token, body);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      const msg = String(e?.message || e);
      json(res, sessionErrorStatus(msg), { ok: false, error: msg });
    }
  });

  router.get('/api/pedidos', async ({ req, res, url }) => {
    const token = getBearerToken(req, url);
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
  });

  router.post(new RegExp(`^/api/pedidos/(${PEDIDO_ID})/(aceitar|fechamento-cliente|fechamento-prestador|orcamento)$`, 'i'), async ({ req, res, match }) => {
    const token = getBearerToken(req);
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    const pedidoId = match[1];
    const acao = String(match[2]).toLowerCase();
    try {
      let out;
      if (acao === 'orcamento') {
        const body = parseJson(await readBody(req));
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
      json(res, sessionErrorStatus(msg), { ok: false, error: msg });
    }
  });

  router.get(new RegExp(`^/api/pedidos/(${PEDIDO_ID})/documento-fiscal$`, 'i'), async ({ req, res, match }) => {
    const token = getBearerToken(req);
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    try {
      const out = await getPedidoDocumentoFiscal(token, match[1]);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      const msg = String(e?.message || e);
      json(res, sessionErrorStatus(msg), { ok: false, error: msg });
    }
  });

  router.post(new RegExp(`^/api/pedidos/(${PEDIDO_ID})/documento-fiscal$`, 'i'), async ({ req, res, match }) => {
    const token = getBearerToken(req);
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    try {
      const body = parseJson(await readBody(req));
      const out = await uploadPedidoDocumentoFiscal(token, match[1], body);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      const msg = String(e?.message || e);
      json(res, sessionErrorStatus(msg), { ok: false, error: msg });
    }
  });

  router.get(new RegExp(`^/api/pedidos/(${PEDIDO_ID})/messages$`, 'i'), async ({ req, res, match }) => {
    const token = getBearerToken(req);
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    try {
      const out = await listPedidoMensagens(token, match[1]);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      const msg = String(e?.message || e);
      json(res, sessionErrorStatus(msg), { ok: false, error: msg });
    }
  });

  router.post(new RegExp(`^/api/pedidos/(${PEDIDO_ID})/messages$`, 'i'), async ({ req, res, match }) => {
    const token = getBearerToken(req);
    if (!token) {
      json(res, 401, { ok: false, error: 'Token em falta' });
      return;
    }
    try {
      const body = parseJson(await readBody(req));
      const out = await postPedidoMensagem(token, match[1], body);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      const msg = String(e?.message || e);
      json(res, sessionErrorStatus(msg), { ok: false, error: msg });
    }
  });

  router.get('/api/conta/documentos-fiscais', async ({ req, res, url }) => {
    const token = getBearerToken(req, url);
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
  });

  router.get('/api/taxa-aceite/cotacao', async ({ res, url }) => {
    try {
      const cotacao = await getTaxaAceiteCotacao(
        url.searchParams.get('km') ?? undefined,
        url.searchParams.get('diaria') ?? undefined,
      );
      json(res, 200, { ok: true, ...cotacao });
    } catch (e) {
      json(res, 500, { ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/api/taxa-prestador-fechamento/cotacao', async ({ res }) => {
    try {
      const cotacao = await getTaxaPrestadorFechamentoCotacao();
      json(res, 200, { ok: true, ...cotacao });
    } catch (e) {
      json(res, 500, { ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/api/prestador-visibilidade/cotacao', async ({ res, url }) => {
    try {
      const cotacao = getPrestadorVisibilidadeCotacao(url.searchParams);
      json(res, 200, { ok: true, ...cotacao });
    } catch (e) {
      json(res, 500, { ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/api/avaliacoes', async ({ req, res }) => {
    try {
      const token = getBearerToken(req);
      if (!token) {
        json(res, 401, { ok: false, error: 'Token em falta — use Authorization: Bearer <token>' });
        return;
      }
      const body = parseJson(await readBody(req));
      const { id } = await addReview(token, body);
      json(res, 200, { ok: true, id });
    } catch (e) {
      const msg = String(e?.message || e);
      json(res, sessionErrorStatus(msg), { ok: false, error: msg });
    }
  });

  router.get('/api/avaliacoes/recebidas', async ({ req, res, url }) => {
    const token = getBearerToken(req, url);
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
  });

  router.get('/api/avaliacoes/recentes', async ({ res, url }) => {
    try {
      const lim = url.searchParams.get('limit');
      const out = await listRecentPortalReviews(lim ? Number(lim) : 6);
      json(res, 200, { ok: true, ...out });
    } catch (e) {
      json(res, 500, { ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/api/avaliacoes', async ({ res, url }) => {
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
  });
}
