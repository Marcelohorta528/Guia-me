/**
 * Mostra / oculta prévia da fila de espera (botões visíveis sem login).
 */
(function (g) {
  function setVisible(wrap, on) {
    if (!wrap) return;
    wrap.hidden = !on;
    wrap.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  function syncPrestador() {
    const token = sessionStorage.getItem('guiame_auth_token');
    const demo = document.getElementById('prestador-pedidos-demo-wrap');
    const live = document.getElementById('prestador-pedidos-live-wrap');
    const hint = document.getElementById('prestador-pedidos-login-hint');
    if (!demo && !live) return;
    const logged =
      !!token &&
      fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
        .then((r) => r.json())
        .then((me) => me.ok && me.tipo === 'prestador')
        .catch(() => false);
    return logged.then((ok) => {
      setVisible(demo, !ok);
      setVisible(live, ok);
      if (hint) {
        hint.hidden = !!ok;
        hint.setAttribute('aria-hidden', ok ? 'true' : 'false');
      }
    });
  }

  function syncCliente() {
    const token = sessionStorage.getItem('guiame_auth_token');
    const demo = document.getElementById('cliente-pedidos-demo-wrap');
    const live = document.getElementById('cliente-pedidos-live-wrap');
    const hint = document.getElementById('cliente-pedidos-login-hint');
    if (!demo && !live) return;
    const logged =
      !!token &&
      fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
        .then((r) => r.json())
        .then((me) => me.ok && me.tipo === 'cliente')
        .catch(() => false);
    return logged.then((ok) => {
      setVisible(demo, !ok);
      setVisible(live, ok);
      if (hint) {
        hint.hidden = !!ok;
        hint.setAttribute('aria-hidden', ok ? 'true' : 'false');
      }
    });
  }

  function sync() {
    return Promise.all([syncPrestador(), syncCliente()]);
  }

  g.GUIA_ME_pedidoFilaDemo = { sync, syncPrestador, syncCliente };
})(window);
