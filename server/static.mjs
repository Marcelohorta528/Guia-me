/**
 * Servir HTML/CSS/JS dos apps cliente, prestador e portal.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

export const STATIC_REDIRECTS = new Map([
  ['/cliente.html', '/cliente/'],
  ['/prestador.html', '/prestador/'],
  ['/cadastro-cliente.html', '/cliente/cadastro.html'],
  ['/cadastro-prestador.html', '/prestador/cadastro.html'],
  ['/login.html', '/cliente/login.html'],
  ['/renovar-biometria.html', '/cliente/renovar-biometria.html'],
]);

export const STATIC_MOUNTS = [
  { prefix: '/cliente', dir: path.join(ROOT, 'apps', 'cliente') },
  { prefix: '/prestador', dir: path.join(ROOT, 'apps', 'prestador') },
  { prefix: '/admin', dir: path.join(ROOT, 'apps', 'admin') },
  { prefix: '/shared', dir: path.join(ROOT, 'shared') },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.md': 'text/markdown; charset=utf-8',
};

function safeJoin(root, reqPath) {
  const clean = decodeURIComponent(reqPath.split('?')[0]).replace(/^\//, '');
  if (!clean || clean.includes('..')) return null;
  const full = path.resolve(root, clean);
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

export function resolveStaticPath(urlPath) {
  const redirect = STATIC_REDIRECTS.get(urlPath);
  if (redirect) return { redirect };

  for (const { prefix, dir } of STATIC_MOUNTS) {
    if (urlPath === prefix || urlPath === prefix + '/') {
      return { file: path.join(dir, 'index.html') };
    }
    if (urlPath.startsWith(prefix + '/')) {
      const rel = urlPath.slice(prefix.length + 1);
      if (!rel) return { file: path.join(dir, 'index.html') };
      const file = safeJoin(dir, rel);
      if (file) return { file };
    }
  }

  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  if (rel.endsWith('/')) rel += 'index.html';
  const file = safeJoin(ROOT, rel);
  return file ? { file } : null;
}

export async function serveStatic(req, res, urlPath) {
  const resolved = resolveStaticPath(urlPath);
  if (!resolved) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  if (resolved.redirect) {
    res.writeHead(302, { Location: resolved.redirect });
    res.end();
    return;
  }

  const filePath = resolved.file;
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) {
    if (e.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(500);
      res.end('Server error');
    }
  }
}
