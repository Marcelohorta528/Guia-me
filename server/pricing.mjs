/** Política de preços documentada no README (pagamentos). Km no pedido = ida; taxa = ida e volta × R$/km. */

export const TAXA_DESLOCAMENTO_POR_KM = 1.5;
/** Valor fixo que o prestador paga à plataforma no aceite do pedido. */
export const TAXA_PLATAFORMA_PRESTADOR_REAIS = 9.9;
/** @deprecated Use {@link TAXA_PLATAFORMA_PRESTADOR_REAIS}. */
export const TAXA_PLATAFORMA_CLIENTE_REAIS = TAXA_PLATAFORMA_PRESTADOR_REAIS;
/** @deprecated Use {@link TAXA_PLATAFORMA_PRESTADOR_REAIS}. */
export const CREDITO_CLIENTE_ACEITE_REAIS = TAXA_PLATAFORMA_PRESTADOR_REAIS;
export const COMISSAO_APP_PERCENT = 15;
export const VALOR_MIN_SERVICO_APP = 100;
export const KM_DESLOCAMENTO_MAX = 150;

/** Prestador compra visibilidade na busca por período do dia. */
export const PRESTADOR_VISIBILIDADE_POR_PERIODO_REAIS = 85;
export const PRESTADOR_VISIBILIDADE_DIARIA_REAIS = 250;

export const PERIODOS_VISIBILIDADE = ['manha', 'tarde', 'noite'];

export const PERIODOS_VISIBILIDADE_LABELS = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
};

/**
 * Cotação da visibilidade do prestador (compra por período ou diária).
 * @param {{ periodos?: string[], diaria?: boolean }} opts
 */
export function computePrestadorVisibilidade(opts = {}) {
  const diaria = Boolean(opts.diaria);
  const precoPeriodo = PRESTADOR_VISIBILIDADE_POR_PERIODO_REAIS;
  const precoDiaria = PRESTADOR_VISIBILIDADE_DIARIA_REAIS;

  if (diaria) {
    return {
      modo: 'diaria',
      periodos: [...PERIODOS_VISIBILIDADE],
      preco_por_periodo_reais: precoPeriodo,
      preco_diaria_reais: precoDiaria,
      total_reais: precoDiaria,
      descricao: 'Diária completa (manhã + tarde + noite)',
    };
  }

  const raw = Array.isArray(opts.periodos) ? opts.periodos : [];
  const unique = [...new Set(raw.filter((p) => PERIODOS_VISIBILIDADE.includes(String(p))))];
  const total = Math.round(unique.length * precoPeriodo * 100) / 100;
  const labels = unique.map((p) => PERIODOS_VISIBILIDADE_LABELS[p] || p);

  return {
    modo: unique.length ? 'periodos' : 'vazio',
    periodos: unique,
    preco_por_periodo_reais: precoPeriodo,
    preco_diaria_reais: precoDiaria,
    total_reais: total,
    descricao: labels.length ? labels.join(' + ') : 'Selecione ao menos um período ou a diária',
  };
}

/**
 * km = distância estimada **só ida** (base do prestador → local do serviço).
 * Cobrança ao cliente = **ida e volta**: km faturados = 2 × km ida (até {@link KM_DESLOCAMENTO_MAX} km na ida).
 * @param {unknown} km
 * @returns {{ km: number, km_faturados: number, taxa: number }}
 */
export function computeTaxaDeslocamento(km) {
  let kIda = Number(String(km ?? '').replace(',', '.'));
  if (!Number.isFinite(kIda) || kIda < 0) kIda = 0;
  kIda = Math.min(KM_DESLOCAMENTO_MAX, kIda);
  kIda = Math.round(kIda * 100) / 100;
  const kmFaturados = Math.round(kIda * 2 * 100) / 100;
  const taxa = Math.round(kmFaturados * TAXA_DESLOCAMENTO_POR_KM * 100) / 100;
  return { km: kIda, km_faturados: kmFaturados, taxa };
}

/**
 * Comissão da app só sobre o valor do serviço (mín. R$ 100).
 * @param {number} valorServico
 * @returns {{ valorServico: number, comissao: number, liquidoPrestadorServico: number }}
 */
export function computeComissaoApp(valorServico) {
  const v = Number(valorServico);
  if (!Number.isFinite(v) || v < 0) {
    throw new Error('Valor do serviço inválido');
  }
  if (v < VALOR_MIN_SERVICO_APP) {
    throw new Error(
      `Valor do serviço mínimo para o app: R$ ${VALOR_MIN_SERVICO_APP.toFixed(2).replace('.', ',')}`
    );
  }
  const comissao = Math.round(v * (COMISSAO_APP_PERCENT / 100) * 100) / 100;
  const liquidoPrestadorServico = Math.round((v - comissao) * 100) / 100;
  return { valorServico: v, comissao, liquidoPrestadorServico };
}
