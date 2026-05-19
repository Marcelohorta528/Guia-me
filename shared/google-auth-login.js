/**
 * Botão «Continuar com Google» nas páginas de login.
 * data-google-login data-app-tipo="cliente|prestador" data-redirect="/cliente/"
 */
(function (g) {
  function loadGis() {
    return new Promise((resolve, reject) => {
      if (g.google?.accounts?.id) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Não foi possível carregar o login Google'));
      document.head.appendChild(s);
    });
  }

  async function finishLogin(tipo, credential, redirect, wrongTipoUrl) {
    const r = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, credential }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Falha no login com Google');

    const meRes = await fetch('/api/auth/me', {
      headers: { Authorization: 'Bearer ' + j.token },
    });
    const me = await meRes.json();
    if (!meRes.ok || !me.ok) throw new Error(me.error || 'Sessão inválida');

    if (me.tipo && me.tipo !== tipo) {
      throw new Error(
        tipo === 'cliente'
          ? 'Esta conta Google é de prestador. Use o app prestador.'
          : 'Esta conta Google é de cliente. Use o app cliente.',
      );
    }

    if (me.biometriaFacial?.precisaRenovar) {
      sessionStorage.setItem('guiame_token_renovacao', j.token);
      const renew =
        tipo === 'cliente' ? '/cliente/renovar-biometria.html' : '/prestador/renovar-biometria.html';
      window.location.href = renew;
      return;
    }

    sessionStorage.setItem('guiame_auth_token', j.token);
    window.location.href = redirect || (tipo === 'cliente' ? '/cliente/' : '/prestador/');
  }

  async function initContainer(el) {
    const tipo = el.dataset.appTipo === 'prestador' ? 'prestador' : 'cliente';
    const redirect = el.dataset.redirect || (tipo === 'cliente' ? '/cliente/' : '/prestador/');
    const cfgRes = await fetch('/api/auth/google-config');
    const cfg = await cfgRes.json().catch(() => ({}));
    if (!cfg.enabled || !cfg.clientId) {
      el.innerHTML =
        '<p class="cad-legal google-login-off">Login com Google indisponível (servidor sem <code>GOOGLE_CLIENT_ID</code>).</p>';
      return;
    }

    await loadGis();
    el.innerHTML = '';

    const sep = document.createElement('p');
    sep.className = 'cad-divider';
    sep.textContent = 'ou';
    el.appendChild(sep);

    const mount = document.createElement('div');
    mount.className = 'google-btn-mount';
    el.appendChild(mount);

    g.google.accounts.id.initialize({
      client_id: cfg.clientId,
      callback: async (resp) => {
        try {
          await finishLogin(tipo, resp.credential, redirect);
        } catch (e) {
          window.alert((e && e.message) || String(e));
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    g.google.accounts.id.renderButton(mount, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: Math.min(400, el.offsetWidth || 320),
      locale: 'pt-BR',
    });
  }

  function boot() {
    document.querySelectorAll('[data-google-login]').forEach((el) => {
      initContainer(el).catch((e) => {
        el.innerHTML =
          '<p class="cad-legal" style="color:var(--color-danger,#f87171)">' +
          (e.message || e) +
          '</p>';
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  g.GUIA_ME_googleAuthLogin = { initContainer, finishLogin };
})(window);
