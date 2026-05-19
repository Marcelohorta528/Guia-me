/** Validação de NF / recibo em PDF (MVP). */

export const FISCAL_DOC_MAX_BYTES = 1_500_000;
/** Garantia do serviço após envio de NF/recibo pelo prestador. */
export const GARANTIA_SERVICO_MESES = 3;

export function assertFiscalPdfPayload(payload) {
  const nome = String(payload?.nome ?? payload?.filename ?? '').trim().slice(0, 200);
  const b64 = String(payload?.pdf_base64 ?? payload?.content_base64 ?? '').trim();
  if (!nome) throw new Error('Informe o nome do ficheiro (NF ou recibo)');
  if (!/\.pdf$/i.test(nome)) throw new Error('O documento deve ser um ficheiro PDF (.pdf)');
  if (!b64) throw new Error('Conteúdo do PDF em falta');
  if (b64.length > FISCAL_DOC_MAX_BYTES * 1.4) {
    throw new Error('PDF demasiado grande (máx. cerca de 1,5 MB)');
  }
  return { nome, pdf_base64: b64 };
}
