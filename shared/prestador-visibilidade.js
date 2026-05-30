/**
 * Compra de visibilidade do prestador: manhã / tarde / noite (R$ 85) ou diária (R$ 250).
 */
(function (g) {
  function fmtBRL(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return 'R$ ' + Number(n).toFixed(2).replace('.', ',');
  }

  function buildQuery(root) {
    const diaria = root.querySelector('[data-visibilidade-diaria]');
    if (diaria && diaria.checked) return '?diaria=1';
    const ids = [];
    root.querySelectorAll('[data-visibilidade-periodo]:checked').forEach((el) => {
      const id = el.getAttribute('data-visibilidade-periodo');
      if (id) ids.push(id);
    });
    if (!ids.length) return '';
    return '?periodos=' + encodeURIComponent(ids.join(','));
  }

  async function fetchCotacao(root) {
    try {
      const r = await fetch('/api/prestador-visibilidade/cotacao' + buildQuery(root));
      if (!r.ok) return null;
      return r.json();
    } catch {
      return null;
    }
  }

  function textoResumo(dc) {
    if (!dc) return 'Não foi possível calcular a visibilidade.';
    if (dc.modo === 'vazio' || !dc.total_reais) {
      return 'Selecione manhã, tarde e/ou noite (R$ 85 cada) ou a diária completa (R$ 250).';
    }
    if (dc.modo === 'diaria') {
      return (
        'Diária completa — manhã + tarde + noite: ' +
        fmtBRL(dc.total_reais) +
        '. Você aparece na busca o dia inteiro.'
      );
    }
    const n = dc.periodos ? dc.periodos.length : 0;
    return (
      (dc.descricao || 'Períodos selecionados') +
      ': ' +
      n +
      ' × ' +
      fmtBRL(dc.preco_por_periodo_reais) +
      ' = ' +
      fmtBRL(dc.total_reais) +
      '.'
    );
  }

  function syncPeriodosDisabled(root) {
    const diaria = root.querySelector('[data-visibilidade-diaria]');
    const on = diaria && diaria.checked;
    root.querySelectorAll('[data-visibilidade-periodo]').forEach((el) => {
      el.disabled = on;
      if (on) el.checked = false;
    });
  }

  async function refresh(root) {
    const out = root.querySelector('[data-visibilidade-resumo]');
    const btn = root.querySelector('[data-visibilidade-comprar]');
    if (out) out.textContent = 'A calcular…';
    const dc = await fetchCotacao(root);
    if (out) out.textContent = textoResumo(dc);
    if (btn) {
      const ok = dc && dc.modo !== 'vazio' && Number(dc.total_reais) > 0;
      btn.disabled = !ok;
      btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    }
    return dc;
  }

  function bind(root) {
    if (!root || root.dataset.visibilidadeBound === '1') return;
    root.dataset.visibilidadeBound = '1';

    root.addEventListener('change', (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.matches('[data-visibilidade-diaria]')) syncPeriodosDisabled(root);
      if (t.matches('[data-visibilidade-diaria], [data-visibilidade-periodo]')) refresh(root);
    });

    const btn = root.querySelector('[data-visibilidade-comprar]');
    if (btn) {
      btn.addEventListener('click', async () => {
        const dc = await refresh(root);
        if (!dc || dc.modo === 'vazio' || !dc.total_reais) return;
        const fb = root.querySelector('[data-visibilidade-feedback]');
        if (fb) {
          fb.textContent =
            'Demo: compra de visibilidade (' +
            (dc.descricao || '') +
            ') por ' +
            fmtBRL(dc.total_reais) +
            ' — pagamento real em breve.';
        }
      });
    }

    syncPeriodosDisabled(root);
    refresh(root);
  }

  function init() {
    document.querySelectorAll('[data-prestador-visibilidade]').forEach(bind);
  }

  g.guiamePrestadorVisibilidadeInit = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
