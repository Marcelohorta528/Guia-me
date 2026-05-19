/**
 * Ponto único de integração KYC (fornecedor pago no fim do projeto).
 * Hoje: modo `local` = fluxo browser existente (FaceDetector / manual).
 * Depois: modo `provider` = SDK + API + webhook (implementar aqui e nos ficheiros listados em KYC-INTEGRACAO.md).
 */

/** @returns {'local' | 'provider'} */
export function getKycMode() {
  const m = String(process.env.KYC_MODE || 'local').toLowerCase().trim();
  return m === 'provider' ? 'provider' : 'local';
}

export function isKycStrict() {
  return String(process.env.KYC_STRICT || '').trim() === '1';
}

/**
 * Injeta metadados de integração no perfil (sem segredos).
 * @param {Record<string, unknown>} perfil
 * @param {{ phase: string }} ctx
 */
export function mergeKycMetadataIntoPerfil(perfil, ctx) {
  if (!perfil || typeof perfil !== 'object') return;
  const mode = getKycMode();
  perfil.kyc_modo = mode;
  perfil.kyc_ambiente = String(process.env.KYC_PUBLIC_ENV || 'dev').slice(0, 32);
  perfil.kyc_fluxo =
    mode === 'local' ? 'browser_facedetector_or_manual_demo' : 'provider_pending_implementation';
  perfil.kyc_fase = String(ctx?.phase || '').slice(0, 48);
  perfil.kyc_doc_referencia = 'KYC-INTEGRACAO.md';
  const slug = process.env.KYC_PROVIDER_SLUG;
  if (slug && String(slug).trim()) {
    perfil.kyc_provedor_slug = String(slug).trim().slice(0, 48);
  }
  perfil.kyc_integracao_versao = 1;
}

export function touchKycRenewalMetadata(perfil) {
  mergeKycMetadataIntoPerfil(perfil, { phase: 'renovacao_mensal' });
}

/**
 * Quando KYC_MODE=provider, o payload do cadastro/renovação deve incluir prova do fornecedor
 * (ex.: applicant_id + check completed). Ativar só com KYC_STRICT=1 até implementar.
 * @param {Record<string, unknown>} payload
 */
export function assertProviderBiometricPayload(payload) {
  if (getKycMode() !== 'provider') return;
  if (!isKycStrict()) return;
  const id = payload?.kycVerificationId ?? payload?.kyc_check_id;
  if (!id || !String(id).trim()) {
    throw new Error(
      'KYC_MODE=provider + KYC_STRICT=1: inclua o identificador da verificação no payload (ex.: kycVerificationId) após integrar o fornecedor — ver KYC-INTEGRACAO.md'
    );
  }
}

/**
 * Webhook do fornecedor KYC — stub até implementação.
 * @param {string} rawBody
 * @param {import('node:http').IncomingHttpHeaders} headers
 */
export async function handleKycWebhookRequest(rawBody, headers) {
  const mode = getKycMode();
  const secret = process.env.KYC_WEBHOOK_SECRET;
  return {
    status: 200,
    body: {
      ok: true,
      stub: true,
      kycMode: mode,
      hasWebhookSecret: Boolean(secret && String(secret).trim()),
      receivedContentType: headers['content-type'] || null,
      bodyLength: rawBody ? String(rawBody).length : 0,
      message:
        'Stub: após contrato KYC, valide a assinatura do fornecedor (KYC_WEBHOOK_SECRET), atualize a conta em store.mjs e remova stub — ver KYC-INTEGRACAO.md',
    },
  };
}
