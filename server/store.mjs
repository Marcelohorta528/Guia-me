/**
 * Persistência local (JSON atómico) + OTP dev + sessões.
 * Sem dependências npm — só Node 18+.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import {
  mergeKycMetadataIntoPerfil,
  touchKycRenewalMetadata,
  assertProviderBiometricPayload,
} from './kyc.mjs';
import {
  computeTaxaDeslocamento,
  computeComissaoApp,
  TAXA_DESLOCAMENTO_POR_KM,
  COMISSAO_APP_PERCENT,
} from './pricing.mjs';
import { validateChatMessage } from './chat-policy.mjs';
import {
  cobrarTaxaAceitePlataforma,
  cobrarTaxaFechamentoPrestador,
  quotePlatformAceiteFee,
  quotePrestadorFechamentoFee,
  quoteCobrancaAceiteCliente,
} from './platform-fee.mjs';
import { assertFiscalPdfPayload, GARANTIA_SERVICO_MESES } from './fiscal-doc.mjs';
import { isOrdersSqliteEnabled, sqliteInsertOrder, sqliteListAllOrders, sqliteGetOrderById, sqliteSaveOrder } from './sqlite-orders.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORE_PATH = path.join(__dirname, 'data', 'store.json');

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Reverificação facial: período em dias (cliente e prestador). */
export const BIOMETRIA_CICLO_DIAS_PADRAO = 30;

let queue = Promise.resolve();

function runExclusive(fn) {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return {
        accounts: [],
        devOtps: {},
        sessions: {},
        reviews: [],
        orders: [],
        orderMessages: [],
        orderFiscalDocs: [],
      };
    }
    if (!data.accounts) data.accounts = [];
    if (!data.devOtps) data.devOtps = {};
    if (!data.sessions) data.sessions = {};
    if (!Array.isArray(data.reviews)) data.reviews = [];
    if (!Array.isArray(data.orders)) data.orders = [];
    if (!Array.isArray(data.orderMessages)) data.orderMessages = [];
    if (!Array.isArray(data.orderFiscalDocs)) data.orderFiscalDocs = [];
    return data;
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
      return {
        accounts: [],
        devOtps: {},
        sessions: {},
        reviews: [],
        orders: [],
        orderMessages: [],
        orderFiscalDocs: [],
      };
    }
    return {
      accounts: [],
      devOtps: {},
      sessions: {},
      reviews: [],
      orders: [],
      orderMessages: [],
      orderFiscalDocs: [],
    };
  }
}

function fiscalDocByPedidoId(store) {
  const map = new Map();
  for (const d of store.orderFiscalDocs || []) {
    if (d && d.pedidoId) map.set(String(d.pedidoId), d);
  }
  return map;
}

function enrichPedidoFiscalMeta(store, order) {
  if (!order) return;
  const d = fiscalDocByPedidoId(store).get(String(order.id));
  if (!d) {
    order.documento_fiscal_nome = null;
    order.documento_fiscal_enviado_at = null;
    order.tem_documento_fiscal = false;
    return;
  }
  order.documento_fiscal_nome = d.nome;
  order.documento_fiscal_enviado_at = d.enviadoAt;
  order.tem_documento_fiscal = true;
  if (d.garantia_meses != null) order.garantia_meses = d.garantia_meses;
  if (d.garantia_ate) order.garantia_ate = d.garantia_ate;
  if (d.servico_concluido_at) order.servico_concluido_at = d.servico_concluido_at;
}

function addMonthsIso(iso, months) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/**
 * Marca serviço concluído após NF/recibo; garantia de até 3 meses; cobra taxa US$ 10 do prestador (1ª vez).
 */
async function concluirServicoViaDocumentoFiscal(store, order, agoraIso) {
  const jaConcluido = String(order.status) === 'concluido';
  order.garantia_meses = GARANTIA_SERVICO_MESES;
  order.garantia_ate = addMonthsIso(agoraIso, GARANTIA_SERVICO_MESES);
  order.servico_concluido_at = agoraIso;
  order.concluido_via = 'documento_fiscal';

  let taxa_prestador_fechamento = null;
  if (!jaConcluido) {
    order.status = 'concluido';
    order.concluidoAt = agoraIso;
    if (!order.fechamentoPrestadorAt) order.fechamentoPrestadorAt = agoraIso;
    taxa_prestador_fechamento = await cobrarTaxaFechamentoPrestador(store, order);
  }
  return taxa_prestador_fechamento;
}

function enrichPedidosFiscalMeta(store, pedidos) {
  if (!Array.isArray(pedidos)) return;
  for (const o of pedidos) enrichPedidoFiscalMeta(store, o);
}

/** Metadados de exibição: fila de espera até aceite inicial de negociação. */
export function enrichPedidoStatusMeta(order) {
  if (!order) return;
  const st = String(order.status || 'novo');
  const emFila = st === 'novo' && !order.prestadorId;
  order.em_fila_espera = emFila;
  if (emFila) {
    order.status_label = 'Na fila de espera';
    order.status_descricao =
      'Aguardando aceite inicial de negociação por um prestador na sua área.';
    return;
  }
  order.em_fila_espera = false;
  if (st === 'aceito') {
    order.status_label = 'Em negociação';
    order.status_descricao =
      'Aceite inicial dado; orçamento, chat e acordo de valor seguem nesta fase.';
    return;
  }
  if (st === 'concluido') {
    order.status_label = 'Concluído';
    order.status_descricao = 'Serviço concluído após NF/recibo do prestador.';
    return;
  }
  order.status_label = st;
  order.status_descricao = '';
}

function enrichPedidosStatusMeta(pedidos) {
  if (!Array.isArray(pedidos)) return;
  for (const o of pedidos) enrichPedidoStatusMeta(o);
}

async function writeStore(data) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, STORE_PATH);
}

export function normalizePhone(s) {
  const d = String(s || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-11) : d;
}

export function setDevOtp(telefone, code) {
  const phone = normalizePhone(telefone);
  return runExclusive(async () => {
    const store = await readStore();
    store.devOtps[phone] = { code: String(code), exp: Date.now() + OTP_TTL_MS };
    await writeStore(store);
    return phone;
  });
}

function hashPassword(password, saltBuf) {
  const hash = scryptSync(String(password), saltBuf, 64);
  return { hash: hash.toString('hex'), salt: saltBuf.toString('hex') };
}

/** CNPJ brasileiro: 14 dígitos e dígitos verificadores (Receita Federal). */
function cnpjValido(cnpjStr) {
  const b = [...String(cnpjStr || '').replace(/\D/g, '')].map(Number);
  if (b.length !== 14) return false;
  if (new Set(b).size === 1) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let n = 0;
  for (let i = 0; i < 12; i++) n += b[i] * w1[i];
  const d1 = n % 11 < 2 ? 0 : 11 - (n % 11);
  if (d1 !== b[12]) return false;
  n = 0;
  for (let i = 0; i < 13; i++) n += b[i] * w2[i];
  const d2 = n % 11 < 2 ? 0 : 11 - (n % 11);
  return d2 === b[13];
}

/**
 * Valida OTP, cria conta e grava numa única transação (evita OTP consumido sem conta).
 */
export function registerCadastro(tipo, payload) {
  return runExclusive(async () => {
    const store = await readStore();
    const phone = normalizePhone(payload.celular);
    if (!phone) throw new Error('Celular inválido');

    if (process.env.SKIP_OTP !== '1') {
      const row = store.devOtps[phone];
      if (!row || Date.now() > row.exp) throw new Error('Código SMS inválido ou expirado');
      if (String(payload.otp) !== row.code) throw new Error('Código SMS inválido ou expirado');
    }

    if (store.accounts.some((a) => a.telefone === phone)) throw new Error('Este celular já está cadastrado');

    const pwd = payload.password;
    if (!pwd || String(pwd).length < 6) throw new Error('Senha deve ter pelo menos 6 caracteres');

    if (String(payload.biometriaFaceOk) !== '1') {
      throw new Error('Verificação facial obrigatória: conclua o passo correspondente no cadastro');
    }
    assertProviderBiometricPayload(payload);

    if (tipo === 'cliente') {
      const docTipo = String(payload.documento_tipo || '').trim();
      const docId = String(payload.documento_id || '').trim();
      if (!docTipo) throw new Error('Selecione o tipo de documento de identidade');
      if (docId.length < 4 || docId.length > 64) {
        throw new Error('Informe o número (ID) do documento de identidade (mín. 4 caracteres)');
      }
    }
    if (tipo === 'prestador') {
      const cnpjDigits = String(payload.cnpj || '').replace(/\D/g, '');
      if (cnpjDigits.length !== 14) {
        throw new Error('CNPJ deve ter 14 dígitos, como impresso no Cartão CNPJ');
      }
      if (!cnpjValido(cnpjDigits)) {
        throw new Error('CNPJ inválido: confira os dígitos verificadores');
      }
    }

    const saltBuf = randomBytes(16);
    const { hash, salt } = hashPassword(pwd, saltBuf);
    const { password, otp, biometriaFaceOk, ...rest } = payload;

    if (process.env.SKIP_OTP !== '1') {
      delete store.devOtps[phone];
    }

    const agoraIso = new Date().toISOString();
    rest.biometria_face_at = agoraIso;
    rest.biometria_face_ciclo_dias = BIOMETRIA_CICLO_DIAS_PADRAO;
    if (payload.biometriaFaceMetodo != null && String(payload.biometriaFaceMetodo).trim()) {
      rest.biometria_face_metodo = String(payload.biometriaFaceMetodo).trim().slice(0, 80);
    }
    delete rest.biometriaFaceMetodo;

    mergeKycMetadataIntoPerfil(rest, {
      phase: tipo === 'prestador' ? 'cadastro_prestador' : 'cadastro_cliente',
    });

    if (tipo === 'cliente') {
      const saldoIni = process.env.CLIENTE_SALDO_INICIAL_DEV;
      if (rest.saldo_reais == null || String(rest.saldo_reais).trim() === '') {
        rest.saldo_reais =
          saldoIni && Number.isFinite(Number(saldoIni)) ? Math.round(Number(saldoIni) * 100) / 100 : 0;
      } else {
        rest.saldo_reais = Math.round(Number(String(rest.saldo_reais).replace(',', '.')) * 100) / 100;
      }
      if (rest.cartao_cadastrado == null) rest.cartao_cadastrado = true;
      if (!rest.cartao_ultimos4) rest.cartao_ultimos4 = '4242';
      if (!rest.preferencia_pagamento) rest.preferencia_pagamento = 'saldo';
    }
    if (tipo === 'prestador') {
      const saldoIni = process.env.PRESTADOR_SALDO_INICIAL_DEV;
      if (rest.saldo_reais == null || String(rest.saldo_reais).trim() === '') {
        rest.saldo_reais =
          saldoIni && Number.isFinite(Number(saldoIni)) ? Math.round(Number(saldoIni) * 100) / 100 : 0;
      } else {
        rest.saldo_reais = Math.round(Number(String(rest.saldo_reais).replace(',', '.')) * 100) / 100;
      }
      if (rest.cartao_cadastrado == null) rest.cartao_cadastrado = true;
      if (!rest.cartao_ultimos4) rest.cartao_ultimos4 = '4242';
      if (!rest.preferencia_pagamento) rest.preferencia_pagamento = 'saldo';
    }

    const id = randomUUID();
    store.accounts.push({
      id,
      tipo,
      telefone: phone,
      password_hash: hash,
      password_salt: salt,
      perfil: rest,
      createdAt: agoraIso,
    });
    await writeStore(store);
    return { id };
  });
}

export function loginAccount(telefone, password) {
  return runExclusive(async () => {
    const store = await readStore();
    const phone = normalizePhone(telefone);
    const acc = store.accounts.find((a) => a.telefone === phone);
    if (!acc) throw new Error('Celular ou senha incorretos');
    if (!acc.password_hash || !acc.password_salt) {
      throw new Error('Esta conta usa login com Google. Toque em «Continuar com Google».');
    }
    const saltBuf = Buffer.from(acc.password_salt, 'hex');
    const { hash } = hashPassword(password, saltBuf);
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(acc.password_hash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Celular ou senha incorretos');
    const token = randomBytes(32).toString('hex');
    pruneSessions(store);
    store.sessions[token] = { accountId: acc.id, exp: Date.now() + SESSION_TTL_MS };
    await writeStore(store);
    return { token, tipo: acc.tipo, accountId: acc.id };
  });
}

function findAccountByGoogle(store, sub, email) {
  return store.accounts.find((a) => {
    if (a.google_sub && a.google_sub === sub) return true;
    const pe = String(a.perfil?.google_email || a.perfil?.email || '')
      .trim()
      .toLowerCase();
    return pe && pe === email;
  });
}

function defaultPerfilGoogle(tipo, profile) {
  const agoraIso = new Date().toISOString();
  const base = {
    google_email: profile.email,
    nome: profile.name,
    foto_url: profile.picture,
    biometria_face_at: agoraIso,
    biometria_face_ciclo_dias: BIOMETRIA_CICLO_DIAS_PADRAO,
    biometria_face_metodo: 'google_signin',
    preferencia_pagamento: 'saldo',
    cartao_cadastrado: true,
    cartao_ultimos4: '4242',
  };
  const saldoCli = process.env.CLIENTE_SALDO_INICIAL_DEV;
  const saldoPre = process.env.PRESTADOR_SALDO_INICIAL_DEV;
  if (tipo === 'cliente') {
    base.saldo_reais =
      saldoCli && Number.isFinite(Number(saldoCli)) ? Math.round(Number(saldoCli) * 100) / 100 : 0;
    base.documento_tipo = 'Conta Google';
    base.documento_id = profile.sub.slice(0, 32);
  } else {
    base.saldo_reais =
      saldoPre && Number.isFinite(Number(saldoPre)) ? Math.round(Number(saldoPre) * 100) / 100 : 0;
    base.cidade_base = 'Rio de Janeiro — RJ';
    base.bairros = ['Copacabana'];
    base.categorias = ['Eletricista'];
    base.cnpj = '00000000000191';
  }
  return base;
}

/** Login ou registo rápido com conta Google (JWT do botão GIS). */
export function loginWithGoogle(tipo, googleProfile) {
  return runExclusive(async () => {
    const store = await readStore();
    const want = tipo === 'prestador' ? 'prestador' : 'cliente';
    const sub = String(googleProfile.sub || '');
    const email = String(googleProfile.email || '').toLowerCase();
    if (!sub || !email) throw new Error('Perfil Google incompleto');

    let acc = findAccountByGoogle(store, sub, email);
    const agoraIso = new Date().toISOString();
    let created = false;

    if (acc) {
      if (acc.tipo !== want) {
        throw new Error(
          want === 'cliente'
            ? 'Esta conta Google está registada como prestador. Use /prestador/login.html'
            : 'Esta conta Google está registada como cliente. Use /cliente/login.html',
        );
      }
      acc.google_sub = sub;
      acc.perfil = acc.perfil || {};
      acc.perfil.google_email = email;
      if (googleProfile.name) acc.perfil.nome = googleProfile.name;
      if (googleProfile.picture) acc.perfil.foto_url = googleProfile.picture;
      acc.perfil.biometria_face_at = acc.perfil.biometria_face_at || agoraIso;
    } else {
      const id = randomUUID();
      acc = {
        id,
        tipo: want,
        telefone: '',
        google_sub: sub,
        password_hash: null,
        password_salt: null,
        perfil: defaultPerfilGoogle(want, { ...googleProfile, sub }),
        createdAt: agoraIso,
        auth_provider: 'google',
      };
      store.accounts.push(acc);
      created = true;
    }

    const token = randomBytes(32).toString('hex');
    pruneSessions(store);
    store.sessions[token] = { accountId: acc.id, exp: Date.now() + SESSION_TTL_MS };
    await writeStore(store);
    return { token, tipo: acc.tipo, accountId: acc.id, created };
  });
}

function computeBiometriaFacial(perfil) {
  const p = perfil && typeof perfil === 'object' ? perfil : {};
  const ciclo = Math.max(1, Number(p.biometria_face_ciclo_dias) || BIOMETRIA_CICLO_DIAS_PADRAO);
  const raw = p.biometria_face_at;
  if (!raw) {
    return {
      cicloDias: ciclo,
      ultimaVerificacaoIso: null,
      proximaRenovacaoIso: null,
      diasRestantes: null,
      precisaRenovar: true,
      motivo: 'sem_registo',
    };
  }
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) {
    return {
      cicloDias: ciclo,
      ultimaVerificacaoIso: null,
      proximaRenovacaoIso: null,
      diasRestantes: null,
      precisaRenovar: true,
      motivo: 'data_invalida',
    };
  }
  const deadline = t + ciclo * 86400000;
  const now = Date.now();
  const precisaRenovar = now >= deadline;
  const diasRestantes = Math.max(0, Math.ceil((deadline - now) / 86400000));
  return {
    cicloDias: ciclo,
    ultimaVerificacaoIso: new Date(t).toISOString(),
    proximaRenovacaoIso: new Date(deadline).toISOString(),
    diasRestantes,
    precisaRenovar,
    motivo: precisaRenovar ? 'ciclo_expirado' : 'ok',
  };
}

function pruneSessions(store) {
  const now = Date.now();
  let removed = false;
  Object.keys(store.sessions).forEach((k) => {
    if (store.sessions[k].exp < now) {
      delete store.sessions[k];
      removed = true;
    }
  });
  return removed;
}

export function getSession(token) {
  return runExclusive(async () => {
    const store = await readStore();
    if (pruneSessions(store)) await writeStore(store);
    const s = store.sessions[token];
    if (!s || s.exp < Date.now()) return null;
    const acc = store.accounts.find((a) => a.id === s.accountId);
    if (!acc) return null;
    return {
      accountId: acc.id,
      tipo: acc.tipo,
      telefone: acc.telefone,
      perfil: acc.perfil,
      biometriaFacial: computeBiometriaFacial(acc.perfil),
    };
  });
}

/**
 * Atualiza a data da última verificação facial (reverificação periódica, ex.: mensal).
 */
export function renovarBiometriaFacial(token, payload) {
  return runExclusive(async () => {
    const store = await readStore();
    if (pruneSessions(store)) await writeStore(store);
    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');
    if (String(payload?.biometriaFaceOk) !== '1') {
      throw new Error('Conclua a verificação facial antes de enviar');
    }
    assertProviderBiometricPayload(payload);
    const acc = store.accounts.find((a) => a.id === sess.accountId);
    if (!acc) throw new Error('Conta não encontrada');
    if (!acc.perfil || typeof acc.perfil !== 'object') acc.perfil = {};
    const agoraIso = new Date().toISOString();
    acc.perfil.biometria_face_at = agoraIso;
    acc.perfil.biometria_face_ciclo_dias = Math.max(
      1,
      Number(acc.perfil.biometria_face_ciclo_dias) || BIOMETRIA_CICLO_DIAS_PADRAO
    );
    if (payload?.biometriaFaceMetodo != null && String(payload.biometriaFaceMetodo).trim()) {
      acc.perfil.biometria_face_metodo = String(payload.biometriaFaceMetodo).trim().slice(0, 80);
    }
    touchKycRenewalMetadata(acc.perfil);
    await writeStore(store);
    return { ok: true, biometria_face_at: agoraIso, biometriaFacial: computeBiometriaFacial(acc.perfil) };
  });
}

function sessionFromStore(store, token) {
  const t = String(token || '').trim();
  if (!t) return null;
  const s = store.sessions[t];
  if (!s || s.exp < Date.now()) return null;
  const acc = store.accounts.find((a) => a.id === s.accountId);
  if (!acc) return null;
  return { accountId: acc.id, tipo: acc.tipo, telefone: acc.telefone, perfil: acc.perfil };
}

function publicAuthorLabel(acc) {
  if (!acc) return 'Usuário';
  const p = acc.perfil || {};
  const name = String(p.nome || p.fantasia || '').trim();
  if (name) return name.slice(0, 48);
  const tel = String(acc.telefone || '');
  return tel.length >= 4 ? `***${tel.slice(-4)}` : 'Usuário';
}

function computeReviewStats(rows) {
  if (!rows.length) return { count: 0, average: null };
  const sum = rows.reduce((a, r) => a + Number(r.rating), 0);
  return { count: rows.length, average: Math.round((sum / rows.length) * 10) / 10 };
}

export function addReview(token, { targetAccountId, rating, comment }) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.reviews)) store.reviews = [];
    if (pruneSessions(store)) await writeStore(store);

    const authorSess = sessionFromStore(store, token);
    if (!authorSess) throw new Error('Sessão inválida ou expirada');

    const tid = String(targetAccountId || '').trim();
    const target = store.accounts.find((a) => a.id === tid);
    if (!target) throw new Error('Conta alvo não encontrada');
    if (tid === authorSess.accountId) throw new Error('Não pode avaliar a própria conta');

    const ra = String(authorSess.tipo);
    const rt = String(target.tipo);
    if (!((ra === 'cliente' && rt === 'prestador') || (ra === 'prestador' && rt === 'cliente'))) {
      throw new Error('Permitido apenas: cliente → prestador ou prestador → cliente');
    }

    const n = Number(rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('Nota deve ser um inteiro de 1 a 5');

    const c = String(comment ?? '').trim();
    if (c.length < 3) throw new Error('Comentário deve ter pelo menos 3 caracteres');
    if (c.length > 800) throw new Error('Comentário muito longo (máx. 800 caracteres)');

    const row = {
      id: randomUUID(),
      authorId: authorSess.accountId,
      authorTipo: ra,
      targetId: tid,
      rating: n,
      comment: c,
      createdAt: new Date().toISOString(),
    };
    store.reviews.push(row);
    await writeStore(store);
    return { id: row.id };
  });
}

export function listReviewsForTarget(targetAccountId, limit = 50) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.reviews)) store.reviews = [];
    const tid = String(targetAccountId || '').trim();
    const lim = Math.min(100, Math.max(1, Number(limit) || 50));
    const target = store.accounts.find((a) => a.id === tid);
    if (!target) throw new Error('Conta alvo não encontrada');
    const all = store.reviews.filter((r) => r.targetId === tid);
    const sorted = [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const items = sorted.slice(0, lim).map((r) => {
      const auth = store.accounts.find((a) => a.id === r.authorId);
      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        authorTipo: r.authorTipo,
        authorLabel: publicAuthorLabel(auth),
      };
    });
    return { reviews: items, stats: computeReviewStats(all) };
  });
}

function targetDisplayName(acc) {
  if (!acc) return 'Profissional';
  const p = acc.perfil || {};
  return String(p.fantasia || p.nome || publicAuthorLabel(acc)).trim() || 'Profissional';
}

/** Comentários recentes no portal (clientes sugerindo prestadores). */
export function listRecentPortalReviews(limit = 6) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.reviews)) store.reviews = [];
    const lim = Math.min(20, Math.max(1, Number(limit) || 6));
    const sorted = [...store.reviews].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const items = [];
    for (const r of sorted) {
      if (items.length >= lim) break;
      const author = store.accounts.find((a) => a.id === r.authorId);
      const target = store.accounts.find((a) => a.id === r.targetId);
      if (String(r.authorTipo) !== 'cliente' || String(target?.tipo) !== 'prestador') continue;
      items.push({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        authorLabel: publicAuthorLabel(author),
        sugestao: targetDisplayName(target),
        servicos: Array.isArray(target?.perfil?.categorias)
          ? target.perfil.categorias.slice(0, 2)
          : [],
      });
    }
    return { reviews: items };
  });
}

export function listReviewsReceived(token, limit = 50) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.reviews)) store.reviews = [];
    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');
    const lim = Math.min(100, Math.max(1, Number(limit) || 50));
    const all = store.reviews.filter((r) => r.targetId === sess.accountId);
    const sorted = [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const items = sorted.slice(0, lim).map((r) => {
      const auth = store.accounts.find((a) => a.id === r.authorId);
      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        authorTipo: r.authorTipo,
        authorLabel: publicAuthorLabel(auth),
      };
    });
    return { reviews: items, stats: computeReviewStats(all) };
  });
}

function cidadeChave(s) {
  return String(s || '')
    .split('—')[0]
    .trim()
    .toLowerCase();
}

function bairroPrestadorAtende(orderBairro, bairrosPrestador) {
  const b = String(orderBairro || '').trim().toLowerCase();
  const list = Array.isArray(bairrosPrestador) ? bairrosPrestador : [];
  return list.some((x) => String(x).trim().toLowerCase() === b);
}

function servicoOverlap(orderServicos, categoriasPrestador) {
  const os = (orderServicos || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  const pc = (categoriasPrestador || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  if (!os.length || !pc.length) return false;
  return os.some((s) => pc.some((p) => p.includes(s) || s.includes(p)));
}

/** Cliente cria pedido de serviço (persistido em store.orders). */
export function createPedido(token, body) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.orders)) store.orders = [];
    if (pruneSessions(store)) await writeStore(store);

    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');
    if (sess.tipo !== 'cliente') throw new Error('Apenas clientes podem criar pedidos');

    const descricao = String(body?.descricao ?? '').trim();
    if (descricao.length < 3) throw new Error('Descrição deve ter pelo menos 3 caracteres');
    if (descricao.length > 4000) throw new Error('Descrição muito longa (máx. 4000 caracteres)');

    const cidade = String(body?.cidade ?? '').trim();
    const bairro = String(body?.bairro ?? '').trim();
    if (!cidade) throw new Error('Cidade é obrigatória');
    if (!bairro) throw new Error('Bairro é obrigatório');

    let servicos = body?.servicos;
    if (!Array.isArray(servicos)) servicos = [];
    servicos = servicos.map((s) => String(s).trim()).filter(Boolean).slice(0, 30);
    if (!servicos.length) throw new Error('Indique pelo menos um serviço (ex.: chips do catálogo)');

    const horarioPref = String(body?.horario_pref ?? '').trim().slice(0, 80);
    let metragem = body?.metragem_m2;
    if (metragem !== undefined && metragem !== null && metragem !== '') {
      metragem = Number(String(metragem).replace(',', '.'));
      if (!Number.isFinite(metragem) || metragem < 0) metragem = null;
      else metragem = Math.round(metragem * 100) / 100;
    } else {
      metragem = null;
    }

    let fotosCount = Number(body?.fotos_count);
    if (!Number.isFinite(fotosCount) || fotosCount < 0) fotosCount = 0;
    fotosCount = Math.min(20, Math.floor(fotosCount));

    const { km: kmDesloc, taxa: taxaDesloc } = computeTaxaDeslocamento(
      body?.km_deslocamento ?? body?.km
    );

    let valorServico = null;
    let comissaoAppReais = null;
    let valorLiquidoPrestadorServico = null;
    const rawValor = body?.valor_servico;
    if (rawValor !== undefined && rawValor !== null && String(rawValor).trim() !== '') {
      const n = Number(String(rawValor).replace(',', '.'));
      const c = computeComissaoApp(n);
      valorServico = c.valorServico;
      comissaoAppReais = c.comissao;
      valorLiquidoPrestadorServico = c.liquidoPrestadorServico;
    }

    const row = {
      id: randomUUID(),
      clienteId: sess.accountId,
      descricao,
      cidade,
      bairro,
      horario_pref: horarioPref || null,
      metragem_m2: metragem,
      fotos_count: fotosCount,
      servicos,
      status: 'novo',
      createdAt: new Date().toISOString(),
      km_deslocamento: kmDesloc,
      taxa_deslocamento_reais: taxaDesloc,
      taxa_deslocamento_por_km: TAXA_DESLOCAMENTO_POR_KM,
      valor_servico: valorServico,
      comissao_app_percent: valorServico != null ? COMISSAO_APP_PERCENT : null,
      comissao_app_reais: comissaoAppReais,
      valor_liquido_prestador_servico: valorLiquidoPrestadorServico,
      prestadorId: null,
      aceitoAt: null,
      fechamentoClienteAt: null,
      fechamentoPrestadorAt: null,
      concluidoAt: null,
      orcamentoValor: null,
      orcamentoObservacao: null,
      orcamentoEnviadoAt: null,
      orcamentoComissaoAppPercent: null,
      orcamentoComissaoAppReais: null,
      orcamentoLiquidoPrestador: null,
      taxa_aceite_usd: null,
      taxa_aceite_cambio_usd_brl: null,
      taxa_aceite_reais: null,
      taxa_aceite_cobrada_at: null,
      taxa_aceite_metodo: null,
      taxa_aceite_plataforma_reais: null,
      taxa_aceite_deslocamento_reais: null,
      taxa_aceite_km_faturados: null,
      taxa_aceite_total_reais: null,
      taxa_prestador_fechamento_usd: null,
      taxa_prestador_fechamento_cambio_usd_brl: null,
      taxa_prestador_fechamento_reais: null,
      taxa_prestador_fechamento_cobrada_at: null,
      taxa_prestador_fechamento_metodo: null,
    };
    if (isOrdersSqliteEnabled()) {
      sqliteInsertOrder(row);
    } else {
      store.orders.push(row);
    }
    await writeStore(store);
    enrichPedidoStatusMeta(row);
    return { id: row.id, pedido: row };
  });
}

function prestadorMatchPedidoNovo(sess, order) {
  const p = sess.perfil || {};
  const cat = Array.isArray(p.categorias) ? p.categorias : [];
  const brs = Array.isArray(p.bairros) ? p.bairros : [];
  const cbase = String(p.cidade_base || '').trim();
  const ck = cidadeChave(cbase);
  if (!ck || cidadeChave(order.cidade) !== ck) return false;
  if (!bairroPrestadorAtende(order.bairro, brs)) return false;
  return servicoOverlap(order.servicos, cat);
}

function loadOrder(store, pedidoId) {
  const id = String(pedidoId || '').trim();
  if (!id) return null;
  if (isOrdersSqliteEnabled()) return sqliteGetOrderById(id);
  if (!Array.isArray(store.orders)) return null;
  return store.orders.find((o) => o.id === id) || null;
}

async function persistOrder(store, order) {
  if (isOrdersSqliteEnabled()) {
    sqliteSaveOrder(order);
  } else {
    if (!Array.isArray(store.orders)) store.orders = [];
    const i = store.orders.findIndex((o) => o.id === order.id);
    if (i >= 0) store.orders[i] = order;
  }
  pruneSessions(store);
  await writeStore(store);
}

/** Prestador aceita um pedido `novo` da sua área; passa a `aceito` e fica atribuído a si. */
export function aceitarPedido(token, pedidoId) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.orders)) store.orders = [];
    if (pruneSessions(store)) await writeStore(store);

    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');
    if (sess.tipo !== 'prestador') throw new Error('Apenas prestadores podem aceitar pedidos');

    const order = loadOrder(store, pedidoId);
    if (!order) throw new Error('Pedido não encontrado');
    if (order.prestadorId === sess.accountId && String(order.status) === 'aceito') {
      enrichPedidoStatusMeta(order);
      return { pedido: order };
    }
    if (String(order.status) !== 'novo' || order.prestadorId) {
      throw new Error('Pedido não está disponível para aceitação');
    }
    if (order.clienteId === sess.accountId) throw new Error('Operação inválida');
    if (!prestadorMatchPedidoNovo(sess, order)) {
      throw new Error('Este pedido não corresponde à sua área ou serviços cadastrados');
    }

    order.prestadorId = sess.accountId;
    order.status = 'aceito';
    order.aceitoAt = new Date().toISOString();

    const taxaAceite = await cobrarTaxaAceitePlataforma(store, order);
    await persistOrder(store, order);
    enrichPedidoStatusMeta(order);
    return { pedido: order, taxa_aceite: taxaAceite };
  });
}

/** Cotação atual da taxa de aceite (US$ 5 → BRL, arredondado para cima). */
export function getTaxaAceiteCotacao(kmIda) {
  return quoteCobrancaAceiteCliente(kmIda);
}

export function getTaxaPrestadorFechamentoCotacao() {
  return quotePrestadorFechamentoFee();
}

/** Prestador atribuído envia ou atualiza proposta de orçamento (pedido em estado `aceito`). */
export function pedidoOrcamentoPrestador(token, pedidoId, payload) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.orders)) store.orders = [];
    if (pruneSessions(store)) await writeStore(store);

    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');
    if (sess.tipo !== 'prestador') throw new Error('Apenas prestadores podem enviar orçamento');

    const order = loadOrder(store, pedidoId);
    if (!order) throw new Error('Pedido não encontrado');
    if (order.prestadorId !== sess.accountId) throw new Error('Este pedido não está atribuído a si');
    if (String(order.status) === 'concluido') {
      throw new Error('Pedido já concluído — não é possível alterar o orçamento');
    }
    if (String(order.status) !== 'aceito') {
      throw new Error('Só pode enviar orçamento depois de aceitar o pedido');
    }

    const valorNum = Number(String(payload?.valor ?? '').replace(',', '.'));
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      throw new Error('Indique um valor válido para o orçamento');
    }
    const c = computeComissaoApp(valorNum);
    const obs = String(payload?.observacao ?? '').trim().slice(0, 2000);

    order.orcamentoValor = c.valorServico;
    order.orcamentoObservacao = obs || null;
    order.orcamentoEnviadoAt = new Date().toISOString();
    order.orcamentoComissaoAppPercent = COMISSAO_APP_PERCENT;
    order.orcamentoComissaoAppReais = c.comissao;
    order.orcamentoLiquidoPrestador = c.liquidoPrestadorServico;

    await persistOrder(store, order);
    return { pedido: order };
  });
}

/** Cliente confirma fechamento do orçamento / acordo (não conclui o serviço — isso ocorre com NF/recibo). */
export function pedidoFechamentoCliente(token, pedidoId) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.orders)) store.orders = [];
    if (pruneSessions(store)) await writeStore(store);

    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');
    if (sess.tipo !== 'cliente') throw new Error('Apenas o cliente do pedido pode registar este fechamento');

    const order = loadOrder(store, pedidoId);
    if (!order) throw new Error('Pedido não encontrado');
    if (order.clienteId !== sess.accountId) throw new Error('Este pedido não é seu');
    if (String(order.status) === 'concluido') {
      return { pedido: order };
    }
    if (String(order.status) !== 'aceito' || !order.prestadorId) {
      throw new Error('Só pode confirmar fechamento depois de um prestador aceitar o pedido');
    }
    if (!order.fechamentoClienteAt) {
      order.fechamentoClienteAt = new Date().toISOString();
    }
    await persistOrder(store, order);
    return { pedido: order };
  });
}

/** Prestador confirma fechamento do orçamento / acordo (serviço conclui-se ao enviar NF/recibo). */
export function pedidoFechamentoPrestador(token, pedidoId) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.orders)) store.orders = [];
    if (pruneSessions(store)) await writeStore(store);

    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');
    if (sess.tipo !== 'prestador') throw new Error('Apenas o prestador atribuído pode registar este fechamento');

    const order = loadOrder(store, pedidoId);
    if (!order) throw new Error('Pedido não encontrado');
    if (order.prestadorId !== sess.accountId) throw new Error('Este pedido não está atribuído a si');
    if (String(order.status) === 'concluido') {
      return { pedido: order };
    }
    if (String(order.status) !== 'aceito') {
      throw new Error('Só pode confirmar fechamento com o pedido em estado aceito');
    }
    if (!order.fechamentoPrestadorAt) {
      order.fechamentoPrestadorAt = new Date().toISOString();
    }
    await persistOrder(store, order);
    return { pedido: order };
  });
}

function canAccessPedidoChat(store, sess, order) {
  if (!sess || !order) return false;
  if (sess.tipo === 'cliente' && order.clienteId === sess.accountId) return true;
  if (sess.tipo === 'prestador') {
    if (order.prestadorId === sess.accountId) return true;
    if (String(order.status) === 'novo' && !order.prestadorId && prestadorMatchPedidoNovo(sess, order)) return true;
  }
  return false;
}

/** Mensagens do pedido em `store.json` → `orderMessages` (independente de pedidos em SQLite). */
export function listPedidoMensagens(token, pedidoId) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.orderMessages)) store.orderMessages = [];
    if (pruneSessions(store)) await writeStore(store);

    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');
    const order = loadOrder(store, pedidoId);
    if (!order) throw new Error('Pedido não encontrado');
    if (!canAccessPedidoChat(store, sess, order)) {
      throw new Error('Sem permissão para ver mensagens deste pedido');
    }

    const pid = String(order.id);
    const msgs = store.orderMessages.filter((m) => m.pedidoId === pid);
    msgs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const items = msgs.map((m) => {
      const acc = store.accounts.find((a) => a.id === m.authorId);
      return {
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        authorTipo: m.authorTipo,
        authorLabel: publicAuthorLabel(acc),
      };
    });
    return { pedidoId: pid, mensagens: items };
  });
}

export function postPedidoMensagem(token, pedidoId, payload) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.orderMessages)) store.orderMessages = [];
    if (pruneSessions(store)) await writeStore(store);

    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');
    const order = loadOrder(store, pedidoId);
    if (!order) throw new Error('Pedido não encontrado');
    if (!canAccessPedidoChat(store, sess, order)) {
      throw new Error('Sem permissão para enviar mensagens neste pedido');
    }

    const body = String(payload?.body ?? payload?.texto ?? '').trim();
    if (body.length < 1) throw new Error('Mensagem em falta');
    if (body.length > 2000) throw new Error('Mensagem muito longa (máx. 2000 caracteres)');

    const chatCheck = validateChatMessage(body);
    if (!chatCheck.ok) throw new Error(chatCheck.error);

    const row = {
      id: randomUUID(),
      pedidoId: String(order.id),
      authorId: sess.accountId,
      authorTipo: sess.tipo,
      body,
      createdAt: new Date().toISOString(),
    };
    store.orderMessages.push(row);
    await writeStore(store);
    const acc = store.accounts.find((a) => a.id === sess.accountId);
    return {
      mensagem: {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt,
        authorTipo: row.authorTipo,
        authorLabel: publicAuthorLabel(acc),
      },
    };
  });
}

/** Cliente: os seus pedidos. Prestador: pedidos novos na sua cidade/bairro/serviços. */
export function listPedidos(token) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.orders)) store.orders = [];
    if (pruneSessions(store)) await writeStore(store);

    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');

    const sorted = isOrdersSqliteEnabled()
      ? sqliteListAllOrders()
      : [...store.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (sess.tipo === 'cliente') {
      const mine = sorted.filter((o) => o.clienteId === sess.accountId);
      enrichPedidosFiscalMeta(store, mine);
      enrichPedidosStatusMeta(mine);
      return { role: 'cliente', pedidos: mine };
    }

    if (sess.tipo === 'prestador') {
      const p = sess.perfil || {};
      const cat = Array.isArray(p.categorias) ? p.categorias : [];
      const brs = Array.isArray(p.bairros) ? p.bairros : [];
      const cbase = String(p.cidade_base || '').trim();
      const ck = cidadeChave(cbase);

      const disponiveis = sorted.filter((o) => {
        if (String(o.status) !== 'novo' || o.prestadorId) return false;
        if (!ck || cidadeChave(o.cidade) !== ck) return false;
        if (!bairroPrestadorAtende(o.bairro, brs)) return false;
        return servicoOverlap(o.servicos, cat);
      });
      const meus = sorted.filter((o) => {
        if (o.prestadorId !== sess.accountId) return false;
        return String(o.status) === 'aceito' || String(o.status) === 'concluido';
      });
      enrichPedidosFiscalMeta(store, [...disponiveis, ...meus]);
      enrichPedidosStatusMeta(disponiveis);
      enrichPedidosStatusMeta(meus);
      return { role: 'prestador', pedidos: disponiveis, meus_pedidos: meus };
    }

    return { role: sess.tipo, pedidos: [] };
  });
}

/** Prestador envia NF ou recibo em PDF ao cliente (por pedido). */
export function uploadPedidoDocumentoFiscal(token, pedidoId, payload) {
  return runExclusive(async () => {
    const store = await readStore();
    if (!Array.isArray(store.orderFiscalDocs)) store.orderFiscalDocs = [];
    if (pruneSessions(store)) await writeStore(store);

    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');
    if (sess.tipo !== 'prestador') throw new Error('Apenas o prestador pode enviar NF ou recibo');

    const order = loadOrder(store, pedidoId);
    if (!order) throw new Error('Pedido não encontrado');
    if (order.prestadorId !== sess.accountId) throw new Error('Este pedido não está atribuído a si');
    const st = String(order.status);
    const substituirDoc = st === 'concluido' && order.concluido_via === 'documento_fiscal';
    if (st !== 'aceito' && !substituirDoc) {
      throw new Error(
        'O serviço só pode ser concluído enviando NF ou recibo em PDF com o pedido em estado aceito',
      );
    }

    const doc = assertFiscalPdfPayload(payload);
    const agora = new Date().toISOString();
    const row = {
      pedidoId: String(order.id),
      clienteId: String(order.clienteId),
      prestadorId: String(sess.accountId),
      nome: doc.nome,
      pdf_base64: doc.pdf_base64,
      enviadoAt: agora,
    };

    let taxa_prestador_fechamento = null;
    let servico_concluido = false;
    if (st === 'aceito') {
      taxa_prestador_fechamento = await concluirServicoViaDocumentoFiscal(store, order, agora);
      servico_concluido = true;
      row.garantia_meses = order.garantia_meses;
      row.garantia_ate = order.garantia_ate;
      row.servico_concluido_at = order.servico_concluido_at;
    } else {
      row.garantia_meses = order.garantia_meses ?? GARANTIA_SERVICO_MESES;
      row.garantia_ate = order.garantia_ate ?? addMonthsIso(agora, GARANTIA_SERVICO_MESES);
      row.servico_concluido_at = order.servico_concluido_at ?? agora;
    }

    store.orderFiscalDocs = (store.orderFiscalDocs || []).filter((d) => d.pedidoId !== row.pedidoId);
    store.orderFiscalDocs.push(row);
    enrichPedidoFiscalMeta(store, order);
    await persistOrder(store, order);

    return {
      pedido: order,
      servico_concluido,
      garantia_meses: order.garantia_meses,
      garantia_ate: order.garantia_ate,
      taxa_prestador_fechamento,
      documento: {
        pedido_id: order.id,
        nome: row.nome,
        enviado_at: row.enviadoAt,
      },
    };
  });
}

/** Cliente ou prestador do pedido: descarregar PDF (base64). */
export function getPedidoDocumentoFiscal(token, pedidoId) {
  return runExclusive(async () => {
    const store = await readStore();
    if (pruneSessions(store)) await writeStore(store);

    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');

    const order = loadOrder(store, pedidoId);
    if (!order) throw new Error('Pedido não encontrado');
    if (!canAccessPedidoChat(store, sess, order)) {
      throw new Error('Sem permissão para ver este documento');
    }

    const d = fiscalDocByPedidoId(store).get(String(pedidoId));
    if (!d) throw new Error('Ainda não há NF ou recibo enviado para este pedido');

    return {
      pedido_id: String(pedidoId),
      nome: d.nome,
      enviado_at: d.enviadoAt,
      pdf_base64: d.pdf_base64,
    };
  });
}

/** Lista resumida de documentos fiscais recebidos (cliente) ou enviados (prestador). */
export function listDocumentosFiscaisConta(token) {
  return runExclusive(async () => {
    const store = await readStore();
    if (pruneSessions(store)) await writeStore(store);

    const sess = sessionFromStore(store, token);
    if (!sess) throw new Error('Sessão inválida ou expirada');

    const docs = [];
    for (const d of store.orderFiscalDocs || []) {
      if (sess.tipo === 'cliente' && d.clienteId === sess.accountId) {
        docs.push({
          pedido_id: d.pedidoId,
          nome: d.nome,
          enviado_at: d.enviadoAt,
          garantia_meses: d.garantia_meses,
          garantia_ate: d.garantia_ate,
          servico_concluido_at: d.servico_concluido_at,
        });
      }
      if (sess.tipo === 'prestador' && d.prestadorId === sess.accountId) {
        docs.push({
          pedido_id: d.pedidoId,
          nome: d.nome,
          enviado_at: d.enviadoAt,
          garantia_meses: d.garantia_meses,
          garantia_ate: d.garantia_ate,
          servico_concluido_at: d.servico_concluido_at,
        });
      }
    }
    docs.sort((a, b) => new Date(b.enviado_at) - new Date(a.enviado_at));
    return { documentos: docs };
  });
}

function accountResumo(store, accountId) {
  if (!accountId) return null;
  const acc = store.accounts.find((a) => a.id === accountId);
  if (!acc) return { id: accountId, nome: 'Conta removida', telefone: null, tipo: null };
  const p = acc.perfil || {};
  return {
    id: acc.id,
    tipo: acc.tipo,
    nome: String(p.nome || p.fantasia || publicAuthorLabel(acc)).trim(),
    telefone: acc.telefone || p.celular || null,
    cidade: p.cidade || p.cidade_base || null,
    bairro: p.bairro || (Array.isArray(p.bairros) ? p.bairros[0] : null),
  };
}

function brl(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.round(Number(n) * 100) / 100;
}

function mapPedidoTransacao(store, order) {
  enrichPedidoStatusMeta(order);
  const valorServico = order.orcamentoValor != null ? order.orcamentoValor : order.valor_servico;
  const comissao =
    order.orcamentoComissaoAppReais != null
      ? order.orcamentoComissaoAppReais
      : order.comissao_app_reais;
  const liquido =
    order.orcamentoLiquidoPrestador != null
      ? order.orcamentoLiquidoPrestador
      : order.valor_liquido_prestador_servico;
  const desloc = brl(order.taxa_deslocamento_reais) || 0;
  const taxaAceite = brl(order.taxa_aceite_total_reais) || 0;
  const taxaFechamento = brl(order.taxa_prestador_fechamento_reais) || 0;
  const totalCliente =
    valorServico != null ? brl(Number(valorServico) + desloc + taxaAceite) : null;

  return {
    id: order.id,
    status: order.status,
    status_label: order.status_label,
    createdAt: order.createdAt,
    aceitoAt: order.aceitoAt,
    concluidoAt: order.concluidoAt,
    cidade: order.cidade,
    bairro: order.bairro,
    servicos: order.servicos || [],
    descricao: String(order.descricao || '').slice(0, 120),
    cliente: accountResumo(store, order.clienteId),
    prestador: accountResumo(store, order.prestadorId),
    valores: {
      valor_servico: brl(order.valor_servico),
      orcamento_valor: brl(order.orcamentoValor),
      valor_efetivo_servico: brl(valorServico),
      taxa_deslocamento_reais: desloc,
      comissao_app_reais: brl(comissao),
      liquido_prestador_servico: brl(liquido),
      taxa_aceite_total_reais: taxaAceite,
      taxa_aceite_cobrada_at: order.taxa_aceite_cobrada_at,
      taxa_prestador_fechamento_reais: taxaFechamento,
      taxa_prestador_fechamento_cobrada_at: order.taxa_prestador_fechamento_cobrada_at,
      total_cliente_estimado: totalCliente,
    },
  };
}

/** Painel admin: todas as transações (pedidos) cliente ↔ prestador. */
export function listTransacoesAdmin() {
  return runExclusive(async () => {
    const store = await readStore();
    const sorted = isOrdersSqliteEnabled()
      ? sqliteListAllOrders()
      : [...(store.orders || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const transacoes = sorted.map((o) => mapPedidoTransacao(store, o));
    const stats = {
      total: transacoes.length,
      novo: transacoes.filter((t) => t.status === 'novo').length,
      aceito: transacoes.filter((t) => t.status === 'aceito').length,
      concluido: transacoes.filter((t) => t.status === 'concluido').length,
    };
    return { stats, transacoes };
  });
}
