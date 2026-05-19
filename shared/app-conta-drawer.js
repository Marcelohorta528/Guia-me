/**
 * Gaveta «menu da conta» (estilo apps de mobilidade): abre/fecha, Escape, foco.
 */
(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function initDrawer(drawerRoot) {
    const id = drawerRoot.id;
    if (!id) return;
    const openBtn = document.querySelector('[aria-controls="' + id + '"]');
    const backdrop = qs('.app-drawer__backdrop', drawerRoot);
    const closeBtn = qs('.app-drawer__close', drawerRoot);
    const panel = qs('.app-drawer__panel', drawerRoot);
    if (!openBtn || !panel) return;

    let lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      drawerRoot.classList.add('app-drawer--open');
      drawerRoot.removeAttribute('hidden');
      drawerRoot.setAttribute('aria-hidden', 'false');
      openBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      closeBtn?.focus();
    }

    function close() {
      drawerRoot.classList.remove('app-drawer--open');
      drawerRoot.setAttribute('hidden', '');
      drawerRoot.setAttribute('aria-hidden', 'true');
      openBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }

    openBtn.addEventListener('click', () => {
      if (drawerRoot.classList.contains('app-drawer--open')) close();
      else open();
    });

    backdrop?.addEventListener('click', close);
    closeBtn?.addEventListener('click', close);

    drawerRoot.querySelectorAll('.app-drawer__link').forEach((a) => {
      a.addEventListener('click', () => {
        window.requestAnimationFrame(() => close());
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawerRoot.classList.contains('app-drawer--open')) {
        e.preventDefault();
        close();
      }
    });
  }

  document.querySelectorAll('[data-app-account-drawer]').forEach(initDrawer);
})();
