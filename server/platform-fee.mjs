/**
 * Taxas em USD convertidas para BRL (câmbio atualizado, arredondamento para cima).
 * Cobrança simulada no saldo ou cartão cadastrado.
 * - Cliente no aceite: deslocamento R$ 2/km (ida e volta) + US$ 5 plataforma → total em BRL.
 * - Prestador: US$ 10 na conclusão do pedido (fechamento bilateral).
 */

import {
  computeTaxaDeslocamento,
  TAXA_DESLOCAMENTO_POR_KM,
} from './pricing.mjs';

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
 * Discriminação da cobrança ao cliente quando o prestador aceita.
 * @param {unknown} kmIda km só ida no pedido
 */
export async function quoteCobrancaAceiteCliente(kmIda) {
  const rate = await fetchUsdBrlRate();
  const desloc = computeTaxaDeslocamento(kmIda);
  const plataformaReais = platformFeeBrlFromRate(PLATFORM_FEE_USD, rate);
  const deslocReais = desloc.taxa;
  const totalReais = Math.round((deslocReais + plataformaReais) * 100) / 100;
  return {
    deslocamento: {
      km_ida: desloc.km,
      km_faturados_ida_volta: desloc.km_faturados,
      taxa_por_km_reais: TAXA_DESLOCAMENTO_POR_KM,
      reais: deslocReais,
      descricao: `${desloc.km} km ida → ${desloc.km_faturados} km ida e volta × R$ ${TAXA_DESLOCAMENTO_POR_KM.toFixed(2).replace('.', ',')}/km`,
    },
    plataforma: {
      usd: PLATFORM_FEE_USD,
      cambio_usd_brl: rate,
      reais: plataformaReais,
      arredondamento: 'ceil',
    },
    total_reais: totalReais,
  };
}

function resumoCobrancaAceiteErro(deslocReais, platformReais, totalReais, rate) {
  const d = deslocReais.toFixed(2).replace('.', ',');
  const p = platformReais.toFixed(2).replace('.', ',');
  const t = totalReais.toFixed(2).replace('.', ',');
  return (
    `Cobrança no aceite: deslocamento R$ ${d} + taxa plataforma US$ ${PLATFORM_FEE_USD.toFixed(2)} (≈ R$ ${p}, câmbio ${rate.toFixed(4)}, arredondado para cima) = total R$ ${t}. ` +
    'O cliente precisa de saldo ou cartão cadastrado. O prestador não pode aceitar até regularizar.'
  );
}

export async function quotePrestadorFechamentoFee() {
  return quoteUsdFee(PRESTADOR_FECHAMENTO_FEE_USD);
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
 * Debita taxa do cliente e preenche campos no pedido. Só na primeira cobrança.
 * @param {object} store
 * @param {object} order
 */
export async function cobrarTaxaAceitePlataforma(store, order) {
  if (order.taxa_aceite_cobrada_at) {
    const total =
      order.taxa_aceite_total_reais != null
        ? Number(order.taxa_aceite_total_reais)
        : Number(order.taxa_aceite_reais);
    return {
      cobrado: false,
      jaCobrado: true,
      usd: order.taxa_aceite_usd ?? PLATFORM_FEE_USD,
      cambio: order.taxa_aceite_cambio_usd_brl,
      reais: total,
      total_reais: total,
      deslocamento_reais: order.taxa_aceite_deslocamento_reais,
      plataforma_reais: order.taxa_aceite_plataforma_reais,
      metodo: order.taxa_aceite_metodo,
    };
  }

  const acc = store.accounts.find((a) => a.id === order.clienteId);
  if (!acc || acc.tipo !== 'cliente') {
    throw new Error('Conta do cliente não encontrada para cobrar taxa de aceite');
  }
  if (!acc.perfil || typeof acc.perfil !== 'object') acc.perfil = {};

  const cotacao = await quoteCobrancaAceiteCliente(order.km_deslocamento);
  const rate = cotacao.plataforma.cambio_usd_brl;
  const deslocReais = cotacao.deslocamento.reais;
  const plataformaReais = cotacao.plataforma.reais;
  const totalReais = cotacao.total_reais;

  order.km_deslocamento = cotacao.deslocamento.km_ida;
  order.taxa_deslocamento_reais = deslocReais;
  order.taxa_deslocamento_por_km = TAXA_DESLOCAMENTO_POR_KM;

  const metodo = debitarTaxaPerfil(
    acc.perfil,
    totalReais,
    acc.perfil.preferencia_pagamento || 'saldo',
  );
  if (!metodo) {
    throw new Error(resumoCobrancaAceiteErro(deslocReais, plataformaReais, totalReais, rate));
  }

  order.taxa_aceite_usd = PLATFORM_FEE_USD;
  order.taxa_aceite_cambio_usd_brl = rate;
  order.taxa_aceite_plataforma_reais = plataformaReais;
  order.taxa_aceite_deslocamento_reais = deslocReais;
  order.taxa_aceite_km_faturados = cotacao.deslocamento.km_faturados_ida_volta;
  order.taxa_aceite_total_reais = totalReais;
  order.taxa_aceite_reais = totalReais;
  order.taxa_aceite_cobrada_at = new Date().toISOString();
  order.taxa_aceite_metodo = metodo;

  return {
    cobrado: true,
    jaCobrado: false,
    usd: PLATFORM_FEE_USD,
    cambio: rate,
    reais: totalReais,
    total_reais: totalReais,
    deslocamento_reais: deslocReais,
    plataforma_reais: plataformaReais,
    deslocamento: cotacao.deslocamento,
    plataforma: cotacao.plataforma,
    metodo,
  };
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
