/** Acesso ao painel admin (variável ADMIN_KEY no .env). */

export function getAdminKeyExpected() {
  return String(process.env.ADMIN_KEY || 'guia-me-dev').trim();
}

export function assertAdminKey(provided) {
  const key = String(provided || '').trim();
  const expected = getAdminKeyExpected();
  if (!key || key !== expected) {
    throw new Error('Chave de administrador inválida');
  }
}
