/**
 * Taxas em USD convertidas para BRL (câmbio atualizado, arredondamento para cima).
 * Cobrança simulada no saldo ou cartão cadastrado.
 * - Cliente no aceite: deslocamento R$ 1,50/km (ida e volta) + diária combinada → prestador.
 * - Prestador no aceite: taxa plataforma R$ 9,90 → Guia-me.
 * - Prestador na conclusão: US$ 10 (fechamento bilateral).
 */

import {
  computeTaxaDeslocamento,
  computePrestadorVisibilidade,
  PERIODOS_VISIBILIDADE,
  PERIODOS_VISIBILIDADE_LABELS,
  PRESTADOR_VISIBILIDADE_DIARIA_REAIS,
  PRESTADOR_VISIBILIDADE_POR_PERIODO_REAIS,
  TAXA_DESLOCAMENTO_POR_KM,
  TAXA_PLATAFORMA_PRESTADOR_REAIS,
} from './pricing.mjs';

/** @deprecated Legado USD — cobrança atual usa {@link TAXA_PLATAFORMA_PRESTADOR_REAIS}. */
export const PLATFORM_FEE_USD = 5;
export const PRESTADOR_FECHAMENTO_FEE_USD = 10;

const FX_FALLBACK = 5.85;

/**
 * @returns {Promise<number>} cotação USD → BRL (1 USD = X BRL)
 */
export async function fetchUsdBrlRate() {
  const env = String(process.env.FX_USD_BRL ?? '').trim().replace(',', '.');
  if (env && Number.isFinite(Number(env)) && Number(env) > 0) {
    return Number(env);
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      const bid = Number(j?.USDBRL?.bid ?? j?.USDBRL?.ask);
      if (Number.isFinite(bid) && bid > 0) return bid;
    }
  } catch {
    /* fallback */
  }
  return FX_FALLBACK;
}

/**
 * Valor em reais, sempre arredondado para cima (centavos).
 * @param {number} usd
 * @param {number} rate
 */
export function platformFeeBrlFromRate(usd, rate) {
  const raw = Number(usd) * Number(rate);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.ceil(raw * 100) / 100;
}

export async function quotePlatformAceiteFee() {
  return quoteUsdFee(PLATFORM_FEE_USD);
}

/**
 * Discriminação da cobrança no aceite (cliente → prestador; prestador → plataforma).
 * @param {unknown} kmIda km só ida no pedido
 * @param {unknown} [diariaReais] diária combinada (repasse ao prestador)
 */
export async function quoteCobrancaAceiteCliente(kmIda, diariaReais) {
  const desloc = computeTaxaDeslocamento(kmIda);
  let diaria = Number(String(diariaReais ?? '').replace(',', '.'));
  if (!Number.isFinite(diaria) || diaria < 0) diaria = 0;
  diaria = Math.round(diaria * 100) / 100;

  const taxaPlataformaReais = TAXA_PLATAFORMA_PRESTADOR_REAIS;
  const deslocReais = desloc.taxa;
  const totalClienteReais = Math.round((deslocReais + diaria) * 100) / 100;
  const totalPrestadorRecebe = totalClienteReais;

  return {
    deslocamento: {
      km_ida: desloc.km,
      km_faturados_ida_volta: desloc.km_faturados,
      taxa_por_km_reais: TAXA_DESLOCAMENTO_POR_KM,
      reais: deslocReais,
      descricao: `${desloc.km} km ida → ${desloc.km_faturados} km ida e volta × R$ ${TAXA_DESLOCAMENTO_POR_KM.toFixed(2).replace('.', ',')}/km`,
      destino: 'prestador',
      paga_por: 'cliente',
      repasse_prestador: true,
    },
    diaria: {
      reais: diaria,
      combinada: diaria > 0,
      descricao:
        diaria > 0
          ? 'Diária combinada (paga pelo cliente ao prestador)'
          : 'Diária combinada — valor a fechar na negociação',
      destino: 'prestador',
      paga_por: 'cliente',
      repasse_prestador: true,
    },
    plataforma: {
      taxa_plataforma_reais: taxaPlataformaReais,
      reais: taxaPlataformaReais,
      descricao: 'Taxa paga pelo prestador à plataforma Guia-me',
      destino: 'plataforma',
      paga_por: 'prestador',
    },
    cliente: {
      total_reais: totalClienteReais,
      descricao: 'Cliente paga deslocamento + diária combinada ao prestador',
    },
    prestador: {
      recebe_deslocamento_reais: deslocReais,
      recebe_diaria_reais: diaria,
      recebe_total_reais: totalPrestadorRecebe,
      paga_plataforma_reais: taxaPlataformaReais,
      descricao: 'Prestador recebe deslocamento + diária; paga R$ 9,90 à plataforma',
    },
    total_cliente_reais: totalClienteReais,
    total_prestador_plataforma_reais: taxaPlataformaReais,
    total_prestador_recebe_reais: totalPrestadorRecebe,
    total_reais: totalClienteReais,
  };
}

function resumoCobrancaClienteErro(deslocReais, diariaReais, totalClienteReais) {
  const d = deslocReais.toFixed(2).replace('.', ',');
  const di = diariaReais.toFixed(2).replace('.', ',');
  const t = totalClienteReais.toFixed(2).replace('.', ',');
  const diariaTxt =
    diariaReais > 0 ? `diária combinada R$ ${di}` : 'diária combinada (a definir)';
  return (
    `Cobrança do cliente no aceite: deslocamento R$ ${d} + ${diariaTxt} = total R$ ${t}. ` +
    'O cliente precisa de saldo ou cartão cadastrado.'
  );
}

function resumoCobrancaPrestadorPlataformaErro(taxaPlataformaReais) {
  const p = taxaPlataformaReais.toFixed(2).replace('.', ',');
  return (
    `Taxa da plataforma no aceite: R$ ${p} (cobrada do prestador). ` +
    'Você precisa de saldo ou cartão cadastrado para aceitar o pedido.'
  );
}

export async function quotePrestadorFechamentoFee() {
  return quoteUsdFee(PRESTADOR_FECHAMENTO_FEE_USD);
}

/**
 * Tabela e cotação da compra de visibilidade (prestador).
 * @param {{ periodos?: string[], diaria?: boolean }} opts
 */
export function quotePrestadorVisibilidade(opts = {}) {
  const cotacao = computePrestadorVisibilidade(opts);
  return {
    catalogo: {
      preco_por_periodo_reais: PRESTADOR_VISIBILIDADE_POR_PERIODO_REAIS,
      preco_diaria_reais: PRESTADOR_VISIBILIDADE_DIARIA_REAIS,
      periodos: PERIODOS_VISIBILIDADE.map((id) => ({
        id,
        label: PERIODOS_VISIBILIDADE_LABELS[id],
        reais: PRESTADOR_VISIBILIDADE_POR_PERIODO_REAIS,
      })),
      diaria: {
        label: 'Diária completa',
        periodos_inclusos: PERIODOS_VISIBILIDADE.map((id) => PERIODOS_VISIBILIDADE_LABELS[id]),
        reais: PRESTADOR_VISIBILIDADE_DIARIA_REAIS,
      },
    },
    ...cotacao,
  };
}

async function quoteUsdFee(usd) {
  const rate = await fetchUsdBrlRate();
  const reais = platformFeeBrlFromRate(usd, rate);
  return {
    usd,
    cambio_usd_brl: rate,
    reais,
    arredondamento: 'ceil',
  };
}

function contaTemCartao(perfil) {
  const p = perfil || {};
  return p.cartao_cadastrado === true || p.cartao_cadastrado === '1' || p.cartao_cadastrado === 1;
}

/**
 * @param {object} perfil
 * @param {number} feeBrl
 * @param {string} pref saldo|cartao
 * @returns {'saldo'|'cartao'}
 */
function debitarTaxaPerfil(perfil, feeBrl, pref) {
  if (!perfil || typeof perfil !== 'object') throw new Error('Perfil inválido para cobrança');
  const saldo = Math.round((Number(perfil.saldo_reais) || 0) * 100) / 100;
  const temCartao = contaTemCartao(perfil);
  const preferencia = String(pref || 'saldo').toLowerCase();

  if (preferencia === 'cartao' && temCartao) return 'cartao';
  if (preferencia === 'saldo' && saldo >= feeBrl) {
    perfil.saldo_reais = Math.round((saldo - feeBrl) * 100) / 100;
    return 'saldo';
  }
  if (saldo >= feeBrl) {
    perfil.saldo_reais = Math.round((saldo - feeBrl) * 100) / 100;
    return 'saldo';
  }
  if (temCartao) return 'cartao';
  return null;
}

/**
 * Debita cobranças no aceite: cliente (desloc. + diária) e prestador (taxa plataforma). Só na primeira cobrança.
 * @param {object} store
 * @param {object} order
 */
export async function cobrarTaxaAceitePlataforma(store, order) {
  if (order.taxa_aceite_cobrada_at) {
    const totalCliente =
      order.taxa_aceite_total_reais != null
        ? Number(order.taxa_aceite_total_reais)
        : Number(order.taxa_aceite_reais);
    return {
      cobrado: false,
      jaCobrado: true,
      usd: order.taxa_aceite_usd ?? PLATFORM_FEE_USD,
      cambio: order.taxa_aceite_cambio_usd_brl,
      reais: totalCliente,
      total_reais: totalCliente,
      total_cliente_reais: totalCliente,
      deslocamento_reais: order.taxa_aceite_deslocamento_reais,
      diaria_reais: order.taxa_aceite_diaria_reais,
      plataforma_reais: order.taxa_aceite_plataforma_reais,
      metodo: order.taxa_aceite_metodo,
      prestador_plataforma_metodo: order.taxa_aceite_prestador_metodo,
    };
  }

  if (!order.prestadorId) {
    throw new Error('Pedido sem prestador atribuído para cobrar taxas de aceite');
  }

  const clienteAcc = store.accounts.find((a) => a.id === order.clienteId);
  if (!clienteAcc || clienteAcc.tipo !== 'cliente') {
    throw new Error('Conta do cliente não encontrada para cobrar no aceite');
  }
  if (!clienteAcc.perfil || typeof clienteAcc.perfil !== 'object') clienteAcc.perfil = {};

  const prestadorAcc = store.accounts.find((a) => a.id === order.prestadorId);
  if (!prestadorAcc || prestadorAcc.tipo !== 'prestador') {
    throw new Error('Conta do prestador não encontrada para cobrar taxa da plataforma');
  }
  if (!prestadorAcc.perfil || typeof prestadorAcc.perfil !== 'object') prestadorAcc.perfil = {};

  const cotacao = await quoteCobrancaAceiteCliente(order.km_deslocamento, resolveDiariaCombinada(order));
  const deslocReais = cotacao.deslocamento.reais;
  const diariaReais = cotacao.diaria.reais;
  const plataformaReais = cotacao.plataforma.reais;
  const totalClienteReais = cotacao.total_cliente_reais;

  order.km_deslocamento = cotacao.deslocamento.km_ida;
  order.taxa_deslocamento_reais = deslocReais;
  order.taxa_deslocamento_por_km = TAXA_DESLOCAMENTO_POR_KM;

  const metodoCliente = debitarTaxaPerfil(
    clienteAcc.perfil,
    totalClienteReais,
    clienteAcc.perfil.preferencia_pagamento || 'saldo',
  );
  if (!metodoCliente) {
    throw new Error(resumoCobrancaClienteErro(deslocReais, diariaReais, totalClienteReais));
  }

  const metodoPrestador = debitarTaxaPerfil(
    prestadorAcc.perfil,
    plataformaReais,
    prestadorAcc.perfil.preferencia_pagamento || 'saldo',
  );
  if (!metodoPrestador) {
    throw new Error(resumoCobrancaPrestadorPlataformaErro(plataformaReais));
  }

  order.taxa_aceite_usd = null;
  order.taxa_aceite_cambio_usd_brl = null;
  order.taxa_aceite_credito_reais = null;
  order.taxa_aceite_plataforma_reais = plataformaReais;
  order.taxa_aceite_deslocamento_reais = deslocReais;
  order.taxa_aceite_diaria_reais = diariaReais;
  order.taxa_aceite_km_faturados = cotacao.deslocamento.km_faturados_ida_volta;
  order.taxa_aceite_total_reais = totalClienteReais;
  order.taxa_aceite_reais = totalClienteReais;
  order.taxa_aceite_cobrada_at = new Date().toISOString();
  order.taxa_aceite_metodo = metodoCliente;
  order.taxa_aceite_prestador_metodo = metodoPrestador;

  return {
    cobrado: true,
    jaCobrado: false,
    reais: totalClienteReais,
    total_reais: totalClienteReais,
    total_cliente_reais: totalClienteReais,
    total_prestador_plataforma_reais: plataformaReais,
    deslocamento_reais: deslocReais,
    diaria_reais: diariaReais,
    plataforma_reais: plataformaReais,
    deslocamento: cotacao.deslocamento,
    diaria: cotacao.diaria,
    plataforma: cotacao.plataforma,
    prestador: cotacao.prestador,
    cliente: cotacao.cliente,
    metodo: metodoCliente,
    prestador_plataforma_metodo: metodoPrestador,
  };
}

function resolveDiariaCombinada(order) {
  const candidates = [
    order?.taxa_aceite_diaria_reais,
    order?.diaria_combinada_reais,
    order?.orcamentoValor,
    order?.valor_servico,
  ];
  for (const c of candidates) {
    const n = Number(String(c ?? '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  return 0;
}

/**
 * Debita taxa do prestador ao concluir o pedido. Só na primeira cobrança.
 * @param {object} store
 * @param {object} order
 */
export async function cobrarTaxaFechamentoPrestador(store, order) {
  if (order.taxa_prestador_fechamento_cobrada_at) {
    return {
      cobrado: false,
      jaCobrado: true,
      usd: order.taxa_prestador_fechamento_usd ?? PRESTADOR_FECHAMENTO_FEE_USD,
      cambio: order.taxa_prestador_fechamento_cambio_usd_brl,
      reais: order.taxa_prestador_fechamento_reais,
      metodo: order.taxa_prestador_fechamento_metodo,
    };
  }
  if (!order.prestadorId) {
    throw new Error('Pedido sem prestador atribuído para cobrar taxa de fechamento');
  }

  const acc = store.accounts.find((a) => a.id === order.prestadorId);
  if (!acc || acc.tipo !== 'prestador') {
    throw new Error('Conta do prestador não encontrada para cobrar taxa de fechamento');
  }
  if (!acc.perfil || typeof acc.perfil !== 'object') acc.perfil = {};

  const rate = await fetchUsdBrlRate();
  const feeBrl = platformFeeBrlFromRate(PRESTADOR_FECHAMENTO_FEE_USD, rate);
  const metodo = debitarTaxaPerfil(
    acc.perfil,
    feeBrl,
    acc.perfil.preferencia_pagamento || 'saldo',
  );
  if (!metodo) {
    const br = feeBrl.toFixed(2).replace('.', ',');
    throw new Error(
      `O prestador precisa de saldo ou cartão cadastrado para a taxa de fechamento (US$ ${PRESTADOR_FECHAMENTO_FEE_USD.toFixed(2)} ≈ R$ ${br}, câmbio ${rate.toFixed(4)} USD/BRL, arredondado para cima). Regularize o pagamento para concluir o pedido.`
    );
  }

  order.taxa_prestador_fechamento_usd = PRESTADOR_FECHAMENTO_FEE_USD;
  order.taxa_prestador_fechamento_cambio_usd_brl = rate;
  order.taxa_prestador_fechamento_reais = feeBrl;
  order.taxa_prestador_fechamento_cobrada_at = new Date().toISOString();
  order.taxa_prestador_fechamento_metodo = metodo;

  return {
    cobrado: true,
    jaCobrado: false,
    usd: PRESTADOR_FECHAMENTO_FEE_USD,
    cambio: rate,
    reais: feeBrl,
    metodo,
  };
}
