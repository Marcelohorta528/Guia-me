/**
 * Pedidos em SQLite local (grátis, ficheiro único).
 * Requer Node.js 22.5+ (`node:sqlite`). Com USE_SQLITE≠1 ou Node antigo, não carrega.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB = path.join(__dirname, 'data', 'guiame.db');
const STORE_JSON = path.join(__dirname, 'data', 'store.json');

let db = null;
let enabled = false;
let initMessage = null;

function useSqliteEnv() {
  const v = String(process.env.USE_SQLITE ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function dbPath() {
  const p = String(process.env.SQLITE_PATH || '').trim();
  return p ? path.resolve(p) : DEFAULT_DB;
}

async function readOrdersFromStoreJson() {
  try {
    const raw = await fs.readFile(STORE_JSON, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.orders) ? data.orders : [];
  } catch {
    return [];
  }
}

function rowFromDb(r) {
  if (!r) return null;
  let servicos = [];
  try {
    servicos = JSON.parse(String(r.servicos_json || '[]'));
    if (!Array.isArray(servicos)) servicos = [];
  } catch {
    servicos = [];
  }
  return {
    id: r.id,
    clienteId: r.cliente_id,
    descricao: r.descricao,
    cidade: r.cidade,
    bairro: r.bairro,
    horario_pref: r.horario_pref,
    metragem_m2: r.metragem_m2,
    fotos_count: r.fotos_count,
    servicos,
    status: r.status,
    createdAt: r.created_at,
    km_deslocamento: r.km_deslocamento != null ? Number(r.km_deslocamento) : 0,
    taxa_deslocamento_reais: r.taxa_deslocamento_reais != null ? Number(r.taxa_deslocamento_reais) : 0,
    taxa_deslocamento_por_km:
      r.taxa_deslocamento_por_km != null && r.taxa_deslocamento_por_km !== ''
        ? Number(r.taxa_deslocamento_por_km)
        : null,
    valor_servico: r.valor_servico != null ? Number(r.valor_servico) : null,
    comissao_app_percent: r.comissao_app_percent != null ? Number(r.comissao_app_percent) : null,
    comissao_app_reais: r.comissao_app_reais != null ? Number(r.comissao_app_reais) : null,
    valor_liquido_prestador_servico:
      r.valor_liquido_prestador_servico != null ? Number(r.valor_liquido_prestador_servico) : null,
    prestadorId: r.prestador_id != null && r.prestador_id !== '' ? String(r.prestador_id) : null,
    aceitoAt: r.aceito_at != null ? String(r.aceito_at) : null,
    fechamentoClienteAt: r.fechamento_cliente_at != null ? String(r.fechamento_cliente_at) : null,
    fechamentoPrestadorAt: r.fechamento_prestador_at != null ? String(r.fechamento_prestador_at) : null,
    concluidoAt: r.concluido_at != null ? String(r.concluido_at) : null,
    orcamentoValor: r.orcamento_valor != null ? Number(r.orcamento_valor) : null,
    orcamentoObservacao: r.orcamento_observacao != null ? String(r.orcamento_observacao) : null,
    orcamentoEnviadoAt: r.orcamento_enviado_at != null ? String(r.orcamento_enviado_at) : null,
    orcamentoComissaoAppPercent:
      r.orcamento_comissao_app_percent != null ? Number(r.orcamento_comissao_app_percent) : null,
    orcamentoComissaoAppReais:
      r.orcamento_comissao_app_reais != null ? Number(r.orcamento_comissao_app_reais) : null,
    orcamentoLiquidoPrestador:
      r.orcamento_liquido_prestador != null ? Number(r.orcamento_liquido_prestador) : null,
    taxa_aceite_usd: r.taxa_aceite_usd != null ? Number(r.taxa_aceite_usd) : null,
    taxa_aceite_cambio_usd_brl:
      r.taxa_aceite_cambio_usd_brl != null ? Number(r.taxa_aceite_cambio_usd_brl) : null,
    taxa_aceite_reais: r.taxa_aceite_reais != null ? Number(r.taxa_aceite_reais) : null,
    taxa_aceite_cobrada_at:
      r.taxa_aceite_cobrada_at != null ? String(r.taxa_aceite_cobrada_at) : null,
    taxa_aceite_metodo:
      r.taxa_aceite_metodo != null && r.taxa_aceite_metodo !== ''
        ? String(r.taxa_aceite_metodo)
        : null,
    taxa_aceite_plataforma_reais:
      r.taxa_aceite_plataforma_reais != null ? Number(r.taxa_aceite_plataforma_reais) : null,
    taxa_aceite_deslocamento_reais:
      r.taxa_aceite_deslocamento_reais != null ? Number(r.taxa_aceite_deslocamento_reais) : null,
    taxa_aceite_km_faturados:
      r.taxa_aceite_km_faturados != null ? Number(r.taxa_aceite_km_faturados) : null,
    taxa_aceite_total_reais:
      r.taxa_aceite_total_reais != null ? Number(r.taxa_aceite_total_reais) : null,
    taxa_prestador_fechamento_usd:
      r.taxa_prestador_fechamento_usd != null ? Number(r.taxa_prestador_fechamento_usd) : null,
    taxa_prestador_fechamento_cambio_usd_brl:
      r.taxa_prestador_fechamento_cambio_usd_brl != null
        ? Number(r.taxa_prestador_fechamento_cambio_usd_brl)
        : null,
    taxa_prestador_fechamento_reais:
      r.taxa_prestador_fechamento_reais != null ? Number(r.taxa_prestador_fechamento_reais) : null,
    taxa_prestador_fechamento_cobrada_at:
      r.taxa_prestador_fechamento_cobrada_at != null
        ? String(r.taxa_prestador_fechamento_cobrada_at)
        : null,
    taxa_prestador_fechamento_metodo:
      r.taxa_prestador_fechamento_metodo != null && r.taxa_prestador_fechamento_metodo !== ''
        ? String(r.taxa_prestador_fechamento_metodo)
        : null,
  };
}

/**
 * Arranque: abre BD, cria tabelas, migra pedidos do store.json uma vez.
 * @returns {{ enabled: boolean, path?: string, message?: string }}
 */
export async function initOrdersSqlite() {
  enabled = false;
  db = null;
  initMessage = null;

  if (!useSqliteEnv()) {
    initMessage = 'USE_SQLITE não ativo — pedidos em store.json';
    return { enabled: false, message: initMessage };
  }

  let DatabaseSync;
  try {
    const mod = await import('node:sqlite');
    DatabaseSync = mod.DatabaseSync;
  } catch (e) {
    initMessage =
      'SQLite indisponível: atualize para Node.js 22.5+ ou desative USE_SQLITE. Pedidos ficam em store.json.';
    console.warn('[sqlite]', initMessage, String(e?.message || e));
    return { enabled: false, message: initMessage };
  }

  const file = dbPath();
  await fs.mkdir(path.dirname(file), { recursive: true });

  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      cliente_id TEXT NOT NULL,
      descricao TEXT NOT NULL,
      cidade TEXT NOT NULL,
      bairro TEXT NOT NULL,
      horario_pref TEXT,
      metragem_m2 REAL,
      fotos_count INTEGER NOT NULL DEFAULT 0,
      servicos_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_cliente ON orders(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
  `);

  const colInfo = db.prepare('PRAGMA table_info(orders)').all();
  const colNames = new Set(colInfo.map((c) => c.name));
  const addCol = (name, decl) => {
    if (!colNames.has(name)) {
      db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${decl}`);
      colNames.add(name);
    }
  };
  addCol('km_deslocamento', 'REAL');
  addCol('taxa_deslocamento_reais', 'REAL');
  addCol('taxa_deslocamento_por_km', 'REAL');
  addCol('valor_servico', 'REAL');
  addCol('comissao_app_percent', 'REAL');
  addCol('comissao_app_reais', 'REAL');
  addCol('valor_liquido_prestador_servico', 'REAL');
  addCol('prestador_id', 'TEXT');
  addCol('aceito_at', 'TEXT');
  addCol('fechamento_cliente_at', 'TEXT');
  addCol('fechamento_prestador_at', 'TEXT');
  addCol('concluido_at', 'TEXT');
  addCol('orcamento_valor', 'REAL');
  addCol('orcamento_observacao', 'TEXT');
  addCol('orcamento_enviado_at', 'TEXT');
  addCol('orcamento_comissao_app_percent', 'REAL');
  addCol('orcamento_comissao_app_reais', 'REAL');
  addCol('orcamento_liquido_prestador', 'REAL');
  addCol('taxa_aceite_usd', 'REAL');
  addCol('taxa_aceite_cambio_usd_brl', 'REAL');
  addCol('taxa_aceite_reais', 'REAL');
  addCol('taxa_aceite_cobrada_at', 'TEXT');
  addCol('taxa_aceite_metodo', 'TEXT');
  addCol('taxa_aceite_plataforma_reais', 'REAL');
  addCol('taxa_aceite_deslocamento_reais', 'REAL');
  addCol('taxa_aceite_km_faturados', 'REAL');
  addCol('taxa_aceite_total_reais', 'REAL');
  addCol('taxa_prestador_fechamento_usd', 'REAL');
  addCol('taxa_prestador_fechamento_cambio_usd_brl', 'REAL');
  addCol('taxa_prestador_fechamento_reais', 'REAL');
  addCol('taxa_prestador_fechamento_cobrada_at', 'TEXT');
  addCol('taxa_prestador_fechamento_metodo', 'TEXT');

  const migrated = db
    .prepare('SELECT v FROM meta WHERE k = ?')
    .get('orders_migrated_from_json');
  if (!migrated) {
    const existing = db.prepare('SELECT COUNT(*) AS c FROM orders').get();
    const count = Number(existing?.c) || 0;
    if (count === 0) {
      const orders = await readOrdersFromStoreJson();
      const ins = db.prepare(`
        INSERT OR IGNORE INTO orders (
          id, cliente_id, descricao, cidade, bairro, horario_pref, metragem_m2,
          fotos_count, servicos_json, status, created_at,
          km_deslocamento, taxa_deslocamento_reais, taxa_deslocamento_por_km,
          valor_servico, comissao_app_percent, comissao_app_reais, valor_liquido_prestador_servico,
          prestador_id, aceito_at, fechamento_cliente_at, fechamento_prestador_at, concluido_at,
          orcamento_valor, orcamento_observacao, orcamento_enviado_at,
          orcamento_comissao_app_percent, orcamento_comissao_app_reais, orcamento_liquido_prestador
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const o of orders) {
        ins.run(
          String(o.id),
          String(o.clienteId),
          String(o.descricao ?? ''),
          String(o.cidade ?? ''),
          String(o.bairro ?? ''),
          o.horario_pref != null ? String(o.horario_pref) : null,
          o.metragem_m2 != null && Number.isFinite(Number(o.metragem_m2)) ? Number(o.metragem_m2) : null,
          Math.min(20, Math.max(0, Math.floor(Number(o.fotos_count) || 0))),
          JSON.stringify(Array.isArray(o.servicos) ? o.servicos : []),
          String(o.status || 'novo'),
          String(o.createdAt || new Date().toISOString()),
          o.km_deslocamento != null && Number.isFinite(Number(o.km_deslocamento)) ? Number(o.km_deslocamento) : 0,
          o.taxa_deslocamento_reais != null && Number.isFinite(Number(o.taxa_deslocamento_reais))
            ? Number(o.taxa_deslocamento_reais)
            : 0,
          o.taxa_deslocamento_por_km != null && Number.isFinite(Number(o.taxa_deslocamento_por_km))
            ? Number(o.taxa_deslocamento_por_km)
            : null,
          o.valor_servico != null && Number.isFinite(Number(o.valor_servico)) ? Number(o.valor_servico) : null,
          o.comissao_app_percent != null && Number.isFinite(Number(o.comissao_app_percent))
            ? Number(o.comissao_app_percent)
            : null,
          o.comissao_app_reais != null && Number.isFinite(Number(o.comissao_app_reais))
            ? Number(o.comissao_app_reais)
            : null,
          o.valor_liquido_prestador_servico != null && Number.isFinite(Number(o.valor_liquido_prestador_servico))
            ? Number(o.valor_liquido_prestador_servico)
            : null,
          o.prestadorId != null ? String(o.prestadorId) : null,
          o.aceitoAt != null ? String(o.aceitoAt) : null,
          o.fechamentoClienteAt != null ? String(o.fechamentoClienteAt) : null,
          o.fechamentoPrestadorAt != null ? String(o.fechamentoPrestadorAt) : null,
          o.concluidoAt != null ? String(o.concluidoAt) : null,
          o.orcamentoValor != null && Number.isFinite(Number(o.orcamentoValor)) ? Number(o.orcamentoValor) : null,
          o.orcamentoObservacao != null ? String(o.orcamentoObservacao) : null,
          o.orcamentoEnviadoAt != null ? String(o.orcamentoEnviadoAt) : null,
          o.orcamentoComissaoAppPercent != null && Number.isFinite(Number(o.orcamentoComissaoAppPercent))
            ? Number(o.orcamentoComissaoAppPercent)
            : null,
          o.orcamentoComissaoAppReais != null && Number.isFinite(Number(o.orcamentoComissaoAppReais))
            ? Number(o.orcamentoComissaoAppReais)
            : null,
          o.orcamentoLiquidoPrestador != null && Number.isFinite(Number(o.orcamentoLiquidoPrestador))
            ? Number(o.orcamentoLiquidoPrestador)
            : null
        );
      }
      if (orders.length) {
        console.log(`[sqlite] Migrados ${orders.length} pedido(s) de store.json → ${file}`);
      }
    }
    db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run(
      'orders_migrated_from_json',
      new Date().toISOString()
    );
  }

  enabled = true;
  initMessage = `Pedidos em SQLite: ${file}`;
  console.log('[sqlite]', initMessage);
  return { enabled: true, path: file, message: initMessage };
}

export function isOrdersSqliteEnabled() {
  return enabled && db != null;
}

export function ordersSqliteStatus() {
  return {
    enabled: isOrdersSqliteEnabled(),
    path: enabled ? dbPath() : undefined,
    message: initMessage,
  };
}

/** Todos os pedidos, mais recentes primeiro (mesmo critério que em memória). */
export function sqliteListAllOrders() {
  if (!isOrdersSqliteEnabled()) return [];
  const stmt = db.prepare(
    'SELECT id, cliente_id, descricao, cidade, bairro, horario_pref, metragem_m2, fotos_count, servicos_json, status, created_at, ' +
      'km_deslocamento, taxa_deslocamento_reais, taxa_deslocamento_por_km, valor_servico, comissao_app_percent, comissao_app_reais, valor_liquido_prestador_servico, ' +
      'prestador_id, aceito_at, fechamento_cliente_at, fechamento_prestador_at, concluido_at, ' +
      'orcamento_valor, orcamento_observacao, orcamento_enviado_at, orcamento_comissao_app_percent, orcamento_comissao_app_reais, orcamento_liquido_prestador, ' +
      'taxa_aceite_usd, taxa_aceite_cambio_usd_brl, taxa_aceite_reais, taxa_aceite_cobrada_at, taxa_aceite_metodo, ' +
      'taxa_aceite_plataforma_reais, taxa_aceite_deslocamento_reais, taxa_aceite_km_faturados, taxa_aceite_total_reais, ' +
      'taxa_prestador_fechamento_usd, taxa_prestador_fechamento_cambio_usd_brl, taxa_prestador_fechamento_reais, taxa_prestador_fechamento_cobrada_at, taxa_prestador_fechamento_metodo ' +
      'FROM orders ORDER BY datetime(created_at) DESC'
  );
  const rows = stmt.all();
  return rows.map(rowFromDb).filter(Boolean);
}

export function sqliteInsertOrder(row) {
  if (!isOrdersSqliteEnabled()) throw new Error('SQLite de pedidos não inicializado');
  const servicosJson = JSON.stringify(Array.isArray(row.servicos) ? row.servicos : []);
  db.prepare(`
    INSERT INTO orders (
      id, cliente_id, descricao, cidade, bairro, horario_pref, metragem_m2,
      fotos_count, servicos_json, status, created_at,
      km_deslocamento, taxa_deslocamento_reais, taxa_deslocamento_por_km,
      valor_servico, comissao_app_percent, comissao_app_reais, valor_liquido_prestador_servico,
      prestador_id, aceito_at, fechamento_cliente_at, fechamento_prestador_at, concluido_at,
      orcamento_valor, orcamento_observacao, orcamento_enviado_at,
      orcamento_comissao_app_percent, orcamento_comissao_app_reais, orcamento_liquido_prestador,
      taxa_aceite_usd, taxa_aceite_cambio_usd_brl, taxa_aceite_reais, taxa_aceite_cobrada_at, taxa_aceite_metodo,
      taxa_aceite_plataforma_reais, taxa_aceite_deslocamento_reais, taxa_aceite_km_faturados, taxa_aceite_total_reais,
      taxa_prestador_fechamento_usd, taxa_prestador_fechamento_cambio_usd_brl, taxa_prestador_fechamento_reais, taxa_prestador_fechamento_cobrada_at, taxa_prestador_fechamento_metodo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(row.id),
    String(row.clienteId),
    String(row.descricao),
    String(row.cidade),
    String(row.bairro),
    row.horario_pref != null ? String(row.horario_pref) : null,
    row.metragem_m2 != null && Number.isFinite(Number(row.metragem_m2)) ? Number(row.metragem_m2) : null,
    Math.min(20, Math.max(0, Math.floor(Number(row.fotos_count) || 0))),
    servicosJson,
    String(row.status || 'novo'),
    String(row.createdAt),
    row.km_deslocamento != null && Number.isFinite(Number(row.km_deslocamento)) ? Number(row.km_deslocamento) : 0,
    row.taxa_deslocamento_reais != null && Number.isFinite(Number(row.taxa_deslocamento_reais))
      ? Number(row.taxa_deslocamento_reais)
      : 0,
    row.taxa_deslocamento_por_km != null && Number.isFinite(Number(row.taxa_deslocamento_por_km))
      ? Number(row.taxa_deslocamento_por_km)
      : null,
    row.valor_servico != null && Number.isFinite(Number(row.valor_servico)) ? Number(row.valor_servico) : null,
    row.comissao_app_percent != null && Number.isFinite(Number(row.comissao_app_percent))
      ? Number(row.comissao_app_percent)
      : null,
    row.comissao_app_reais != null && Number.isFinite(Number(row.comissao_app_reais))
      ? Number(row.comissao_app_reais)
      : null,
    row.valor_liquido_prestador_servico != null && Number.isFinite(Number(row.valor_liquido_prestador_servico))
      ? Number(row.valor_liquido_prestador_servico)
      : null,
    row.prestadorId != null ? String(row.prestadorId) : null,
    row.aceitoAt != null ? String(row.aceitoAt) : null,
    row.fechamentoClienteAt != null ? String(row.fechamentoClienteAt) : null,
    row.fechamentoPrestadorAt != null ? String(row.fechamentoPrestadorAt) : null,
    row.concluidoAt != null ? String(row.concluidoAt) : null,
    row.orcamentoValor != null && Number.isFinite(Number(row.orcamentoValor)) ? Number(row.orcamentoValor) : null,
    row.orcamentoObservacao != null ? String(row.orcamentoObservacao) : null,
    row.orcamentoEnviadoAt != null ? String(row.orcamentoEnviadoAt) : null,
    row.orcamentoComissaoAppPercent != null && Number.isFinite(Number(row.orcamentoComissaoAppPercent))
      ? Number(row.orcamentoComissaoAppPercent)
      : null,
    row.orcamentoComissaoAppReais != null && Number.isFinite(Number(row.orcamentoComissaoAppReais))
      ? Number(row.orcamentoComissaoAppReais)
      : null,
    row.orcamentoLiquidoPrestador != null && Number.isFinite(Number(row.orcamentoLiquidoPrestador))
      ? Number(row.orcamentoLiquidoPrestador)
      : null,
    ...feeSqlValues(row),
    ...prestadorFechamentoSqlValues(row),
  );
}

const SQL_ORDER_SELECT =
  'SELECT id, cliente_id, descricao, cidade, bairro, horario_pref, metragem_m2, fotos_count, servicos_json, status, created_at, ' +
  'km_deslocamento, taxa_deslocamento_reais, taxa_deslocamento_por_km, valor_servico, comissao_app_percent, comissao_app_reais, valor_liquido_prestador_servico, ' +
  'prestador_id, aceito_at, fechamento_cliente_at, fechamento_prestador_at, concluido_at, ' +
  'orcamento_valor, orcamento_observacao, orcamento_enviado_at, orcamento_comissao_app_percent, orcamento_comissao_app_reais, orcamento_liquido_prestador, ' +
  'taxa_aceite_usd, taxa_aceite_cambio_usd_brl, taxa_aceite_reais, taxa_aceite_cobrada_at, taxa_aceite_metodo, ' +
  'taxa_aceite_plataforma_reais, taxa_aceite_deslocamento_reais, taxa_aceite_km_faturados, taxa_aceite_total_reais, ' +
  'taxa_prestador_fechamento_usd, taxa_prestador_fechamento_cambio_usd_brl, taxa_prestador_fechamento_reais, taxa_prestador_fechamento_cobrada_at, taxa_prestador_fechamento_metodo ' +
  'FROM orders WHERE id = ?';

function feeSqlValues(row) {
  return [
    row.taxa_aceite_usd != null && Number.isFinite(Number(row.taxa_aceite_usd))
      ? Number(row.taxa_aceite_usd)
      : null,
    row.taxa_aceite_cambio_usd_brl != null && Number.isFinite(Number(row.taxa_aceite_cambio_usd_brl))
      ? Number(row.taxa_aceite_cambio_usd_brl)
      : null,
    row.taxa_aceite_reais != null && Number.isFinite(Number(row.taxa_aceite_reais))
      ? Number(row.taxa_aceite_reais)
      : null,
    row.taxa_aceite_cobrada_at != null ? String(row.taxa_aceite_cobrada_at) : null,
    row.taxa_aceite_metodo != null ? String(row.taxa_aceite_metodo) : null,
    row.taxa_aceite_plataforma_reais != null && Number.isFinite(Number(row.taxa_aceite_plataforma_reais))
      ? Number(row.taxa_aceite_plataforma_reais)
      : null,
    row.taxa_aceite_deslocamento_reais != null && Number.isFinite(Number(row.taxa_aceite_deslocamento_reais))
      ? Number(row.taxa_aceite_deslocamento_reais)
      : null,
    row.taxa_aceite_km_faturados != null && Number.isFinite(Number(row.taxa_aceite_km_faturados))
      ? Number(row.taxa_aceite_km_faturados)
      : null,
    row.taxa_aceite_total_reais != null && Number.isFinite(Number(row.taxa_aceite_total_reais))
      ? Number(row.taxa_aceite_total_reais)
      : null,
  ];
}

function prestadorFechamentoSqlValues(row) {
  return [
    row.taxa_prestador_fechamento_usd != null && Number.isFinite(Number(row.taxa_prestador_fechamento_usd))
      ? Number(row.taxa_prestador_fechamento_usd)
      : null,
    row.taxa_prestador_fechamento_cambio_usd_brl != null &&
    Number.isFinite(Number(row.taxa_prestador_fechamento_cambio_usd_brl))
      ? Number(row.taxa_prestador_fechamento_cambio_usd_brl)
      : null,
    row.taxa_prestador_fechamento_reais != null &&
    Number.isFinite(Number(row.taxa_prestador_fechamento_reais))
      ? Number(row.taxa_prestador_fechamento_reais)
      : null,
    row.taxa_prestador_fechamento_cobrada_at != null
      ? String(row.taxa_prestador_fechamento_cobrada_at)
      : null,
    row.taxa_prestador_fechamento_metodo != null
      ? String(row.taxa_prestador_fechamento_metodo)
      : null,
  ];
}

/** Um pedido por id (SQLite ativo). */
export function sqliteGetOrderById(id) {
  if (!isOrdersSqliteEnabled()) return null;
  const r = db.prepare(SQL_ORDER_SELECT).get(String(id));
  return r ? rowFromDb(r) : null;
}

/** Atualiza linha completa (mesmos campos que INSERT). */
export function sqliteSaveOrder(row) {
  if (!isOrdersSqliteEnabled()) throw new Error('SQLite de pedidos não inicializado');
  const servicosJson = JSON.stringify(Array.isArray(row.servicos) ? row.servicos : []);
  db.prepare(`
    UPDATE orders SET
      cliente_id = ?, descricao = ?, cidade = ?, bairro = ?, horario_pref = ?, metragem_m2 = ?, fotos_count = ?, servicos_json = ?, status = ?, created_at = ?,
      km_deslocamento = ?, taxa_deslocamento_reais = ?, taxa_deslocamento_por_km = ?, valor_servico = ?, comissao_app_percent = ?, comissao_app_reais = ?, valor_liquido_prestador_servico = ?,
      prestador_id = ?, aceito_at = ?, fechamento_cliente_at = ?, fechamento_prestador_at = ?, concluido_at = ?,
      orcamento_valor = ?, orcamento_observacao = ?, orcamento_enviado_at = ?, orcamento_comissao_app_percent = ?, orcamento_comissao_app_reais = ?, orcamento_liquido_prestador = ?,
      taxa_aceite_usd = ?, taxa_aceite_cambio_usd_brl = ?, taxa_aceite_reais = ?, taxa_aceite_cobrada_at = ?, taxa_aceite_metodo = ?,
      taxa_aceite_plataforma_reais = ?, taxa_aceite_deslocamento_reais = ?, taxa_aceite_km_faturados = ?, taxa_aceite_total_reais = ?,
      taxa_prestador_fechamento_usd = ?, taxa_prestador_fechamento_cambio_usd_brl = ?, taxa_prestador_fechamento_reais = ?, taxa_prestador_fechamento_cobrada_at = ?, taxa_prestador_fechamento_metodo = ?
    WHERE id = ?
  `).run(
    String(row.clienteId),
    String(row.descricao),
    String(row.cidade),
    String(row.bairro),
    row.horario_pref != null ? String(row.horario_pref) : null,
    row.metragem_m2 != null && Number.isFinite(Number(row.metragem_m2)) ? Number(row.metragem_m2) : null,
    Math.min(20, Math.max(0, Math.floor(Number(row.fotos_count) || 0))),
    servicosJson,
    String(row.status || 'novo'),
    String(row.createdAt),
    row.km_deslocamento != null && Number.isFinite(Number(row.km_deslocamento)) ? Number(row.km_deslocamento) : 0,
    row.taxa_deslocamento_reais != null && Number.isFinite(Number(row.taxa_deslocamento_reais))
      ? Number(row.taxa_deslocamento_reais)
      : 0,
    row.taxa_deslocamento_por_km != null && Number.isFinite(Number(row.taxa_deslocamento_por_km))
      ? Number(row.taxa_deslocamento_por_km)
      : null,
    row.valor_servico != null && Number.isFinite(Number(row.valor_servico)) ? Number(row.valor_servico) : null,
    row.comissao_app_percent != null && Number.isFinite(Number(row.comissao_app_percent))
      ? Number(row.comissao_app_percent)
      : null,
    row.comissao_app_reais != null && Number.isFinite(Number(row.comissao_app_reais))
      ? Number(row.comissao_app_reais)
      : null,
    row.valor_liquido_prestador_servico != null && Number.isFinite(Number(row.valor_liquido_prestador_servico))
      ? Number(row.valor_liquido_prestador_servico)
      : null,
    row.prestadorId != null ? String(row.prestadorId) : null,
    row.aceitoAt != null ? String(row.aceitoAt) : null,
    row.fechamentoClienteAt != null ? String(row.fechamentoClienteAt) : null,
    row.fechamentoPrestadorAt != null ? String(row.fechamentoPrestadorAt) : null,
    row.concluidoAt != null ? String(row.concluidoAt) : null,
    row.orcamentoValor != null && Number.isFinite(Number(row.orcamentoValor)) ? Number(row.orcamentoValor) : null,
    row.orcamentoObservacao != null ? String(row.orcamentoObservacao) : null,
    row.orcamentoEnviadoAt != null ? String(row.orcamentoEnviadoAt) : null,
    row.orcamentoComissaoAppPercent != null && Number.isFinite(Number(row.orcamentoComissaoAppPercent))
      ? Number(row.orcamentoComissaoAppPercent)
      : null,
    row.orcamentoComissaoAppReais != null && Number.isFinite(Number(row.orcamentoComissaoAppReais))
      ? Number(row.orcamentoComissaoAppReais)
      : null,
    row.orcamentoLiquidoPrestador != null && Number.isFinite(Number(row.orcamentoLiquidoPrestador))
      ? Number(row.orcamentoLiquidoPrestador)
      : null,
    ...feeSqlValues(row),
    ...prestadorFechamentoSqlValues(row),
    String(row.id)
  );
}
