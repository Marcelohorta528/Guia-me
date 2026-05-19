/**
 * Verificação do ID token Google (sem dependências npm).
 * Configure GOOGLE_CLIENT_ID no .env — ver DEPLOY-HOSPEDAGEM.md
 */

export function getGoogleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || '').trim();
}

export async function verifyGoogleIdToken(credential) {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error(
      'Login com Google não está configurado no servidor (defina GOOGLE_CLIENT_ID no .env)',
    );
  }
  const token = String(credential || '').trim();
  if (!token) throw new Error('Token Google em falta');

  const url =
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token);
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Token Google inválido ou expirado');
  }
  if (String(data.aud) !== clientId) {
    throw new Error('Token Google não pertence a esta aplicação');
  }
  if (String(data.email_verified) !== 'true') {
    throw new Error('E-mail Google não verificado');
  }
  const email = String(data.email || '')
    .trim()
    .toLowerCase();
  if (!email) throw new Error('E-mail Google em falta');

  return {
    sub: String(data.sub || ''),
    email,
    name: String(data.name || data.given_name || '').trim() || email.split('@')[0],
    picture: String(data.picture || '').trim() || null,
  };
}
