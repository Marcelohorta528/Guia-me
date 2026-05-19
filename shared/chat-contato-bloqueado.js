/**
 * Validação do chat (espelha server/chat-policy.mjs) — bloqueia contacto fora do app.
 */
(function (g) {
  const KEYWORDS = [
    'whatsapp',
    'whats app',
    'whats',
    'telegram',
    'instagram',
    'facebook',
    'tiktok',
    'me liga',
    'me chama',
    'meu numero',
    'meu número',
    'meu telefone',
    'meu celular',
    'telefone',
    'celular',
    'e-mail',
    'email',
    'gmail',
    'hotmail',
    'chama no',
    'zap',
  ];

  const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;
  const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/i;
  const AT_HANDLE_RE = /@[A-Za-z0-9._]{3,}/i;
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
    const lower = String(text).toLowerCase();
    return KEYWORDS.some((k) => lower.includes(k));
  }

  function validateChatMessage(body) {
    const text = String(body ?? '').trim();
    if (!text) return { ok: false, error: 'Mensagem em falta' };
    if (EMAIL_RE.test(text)) {
      return {
        ok: false,
        error: 'Não é permitido enviar e-mail no chat. Combine tudo pelo app Guia-me.',
      };
    }
    if (URL_RE.test(text)) {
      return {
        ok: false,
        error: 'Não é permitido enviar links no chat. Use apenas o chat do app.',
      };
    }
    if (AT_HANDLE_RE.test(text) && !EMAIL_RE.test(text)) {
      return { ok: false, error: 'Não é permitido enviar @ de rede social no chat.' };
    }
    if (looksLikePhone(text)) {
      return {
        ok: false,
        error: 'Não é permitido enviar telefone ou WhatsApp no chat. A conversa é só pelo app.',
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

  g.GUIA_ME_chatPolicy = {
    validateChatMessage,
    CHAT_POLICY_HINT:
      'Conversa apenas pelo app: não envie telefone, WhatsApp, e-mail, links nem redes sociais.',
  };
})(window);
