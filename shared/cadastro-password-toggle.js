/**
 * Botão «olho» para mostrar/ocultar campos de senha (login + cadastros).
 * Espera: .cad-password-wrap > input + button.cad-password-toggle[data-password-target="<id do input>"]
 */
(function () {
  function bindOne(btn) {
    if (btn.dataset.passwordToggleBound === '1') return;
    btn.dataset.passwordToggleBound = '1';
    const id = btn.getAttribute('data-password-target');
    const inp = id ? document.getElementById(id) : btn.closest('.cad-password-wrap')?.querySelector('input');
    if (!inp) return;
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', 'Mostrar senha');
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('title', 'Mostrar senha');
    btn.addEventListener('click', () => {
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
      btn.setAttribute('title', show ? 'Ocultar senha' : 'Mostrar senha');
    });
  }

  function bindAll() {
    document.querySelectorAll('.cad-password-toggle[data-password-target]').forEach(bindOne);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAll);
  } else {
    bindAll();
  }
})();
