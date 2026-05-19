/**
 * Política do chat: conversa só dentro do app — sem telefone, e-mail, links ou redes sociais.
 */

const KEYWORDS = [
  'whatsapp',
  'whats app',
  'whats',
  'telegram',
  'telegran',
  'instagram',
  'instagran',
  'facebook',
  'face book',
  'tiktok',
  'tik tok',
  'me liga',
  'me chama',
  'meu numero',
  'meu número',
  'meu telefone',
  'meu celular',
  'meu zap',
  'meu whats',
  'telefone',
  'celular',
  'fone',
  'e-mail',
  'email',
  'gmail',
  'hotmail',
  'outlook',
  'yahoo',
  'chama no',
  'liga no',
  'passo o',
  'passar o',
  'contato',
  'contatos',
  'zap',
];

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/i;
const AT_HANDLE_RE = /@[A-Za-z0-9._]{3,}/i;

/** 10–13 dígitos com separadores opcionais (BR e +55). */
const PHONE_RE =
  /(?:\+?\s*55\s*)?(?:\(?\s*\d{2}\s*\)?\s*)?(?:9\s*)?[\d\s.\-()]{8,}[\d]/;

function digitsOnly(s) {
  return String(s).replace(/\D/g, '');
}

function looksLikePhone(text) {
  const t = String(text);
  if (PHONE_RE.test(t)) {
    const d = digitsOnly(t);
    if (d.length >= 10 && d.length <= 13) return true;
  }
  const chunks = t.match(/\d[\d\s.\-()]{7,}\d/g);
  if (chunks) {
    for (const c of chunks) {
      const d = digitsOnly(c);
      if (d.length >= 10 && d.length <= 13) return true;
    }
  }
  return false;
}

function hasBlockedKeyword(text) {
  const lower = String(text).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  return KEYWORDS.some((k) => {
    const nk = k.normalize('NFD').replace(/\p{M}/gu, '');
    return lower.includes(nk);
  });
}

/**
 * @param {string} body
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateChatMessage(body) {
  const text = String(body ?? '').trim();
  if (!text) return { ok: false, error: 'Mensagem em falta' };

  if (EMAIL_RE.test(text)) {
    return {
      ok: false,
      error:
        'Não é permitido enviar e-mail no chat. Combine tudo pelo app Guia-me.',
    };
  }
  if (URL_RE.test(text)) {
    return {
      ok: false,
      error: 'Não é permitido enviar links no chat. Use apenas o chat do app.',
    };
  }
  if (AT_HANDLE_RE.test(text) && !EMAIL_RE.test(text)) {
    return {
      ok: false,
      error: 'Não é permitido enviar @ de rede social no chat.',
    };
  }
  if (looksLikePhone(text)) {
    return {
      ok: false,
      error:
        'Não é permitido enviar telefone ou WhatsApp no chat. A conversa é só pelo app.',
    };
  }
  if (hasBlockedKeyword(text)) {
    return {
      ok: false,
      error:
        'Não é permitido pedir contato externo (telefone, WhatsApp, e-mail, etc.). Use só este chat.',
    };
  }

  return { ok: true };
}

export const CHAT_POLICY_HINT =
  'Conversa apenas pelo app: não envie telefone, WhatsApp, e-mail, links nem redes sociais.';
