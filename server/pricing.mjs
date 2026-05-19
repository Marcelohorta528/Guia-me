/** Política de preços documentada no README (pagamentos). Km no pedido = ida; taxa = ida e volta × R$/km. */

export const TAXA_DESLOCAMENTO_POR_KM = 2;
export const COMISSAO_APP_PERCENT = 15;
export const VALOR_MIN_SERVICO_APP = 100;
export const KM_DESLOCAMENTO_MAX = 150;

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
