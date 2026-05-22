/** Utilitários HTTP partilhados pelo backend. */

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 2_000_000) reject(new Error('Body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

export function parseJson(raw) {
  if (!raw || !String(raw).trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('JSON inválido no corpo do pedido');
  }
}

export function getBearerToken(req, url) {
  const auth = req.headers.authorization || '';
  const fromHeader = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const fromQuery = url?.searchParams?.get('token') || '';
  return (fromHeader || fromQuery).trim();
}

export function sessionErrorStatus(msg) {
  if (msg.includes('Sessão')) return 401;
  if (msg.includes('não encontrado') || msg.includes('Ainda não')) return 404;
  if (msg.includes('permissão')) return 403;
  return 400;
}
