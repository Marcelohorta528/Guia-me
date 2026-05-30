/**
 * Prévia da cobrança no aceite: deslocamento R$ 1,50/km (ida e volta) + taxa plataforma R$ 9,90.
 */
(function (g) {
  function fmtBRL(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return 'R$ ' + Number(n).toFixed(2).replace('.', ',');
  }

  async function fetchCotacao(km) {
    const raw = String(km ?? '').trim().replace(',', '.');
    const q = raw && Number.isFinite(Number(raw)) ? '?km=' + encodeURIComponent(raw) : '';
    try {
      const r = await fetch('/api/taxa-aceite/cotacao' + q);
      if (!r.ok) return null;
      return r.json();
    } catch {
      return null;
    }
  }

  function textoCotacao(dc) {
    if (!dc || dc.total_reais == null) {
      return 'Cobrança no aceite: informe km (só ida) para ver deslocamento + taxa plataforma R$ 9,90 + total.';
    }
    const d = dc.deslocamento;
    const pl = dc.plataforma;
    const parts = ['Cobrança no aceite do prestador (saldo ou cartão):'];
    if (d) {
      parts.push(
        '1) Deslocamento ' +
          (d.descricao || '') +
          ' = ' +
          fmtBRL(d.reais) +
          ' (repasse integral ao prestador)',
      );
    }
    if (pl) {
      const taxaPlataforma = pl.taxa_plataforma_reais != null ? pl.taxa_plataforma_reais : pl.credito_reais != null ? pl.credito_reais : pl.reais;
      parts.push('2) Taxa plataforma (cliente paga): ' + fmtBRL(taxaPlataforma));
    }
    if (dc.prestador && dc.prestador.descricao) {
      parts.push('3) ' + dc.prestador.descricao);
    }
    parts.push('Total a debitar: ' + fmtBRL(dc.total_reais) + '.');
    return parts.join(' ');
  }

  /**
   * @param {HTMLElement|null} el
   * @param {unknown} km
   */
  async function renderInto(el, km) {
    if (!el) return null;
    el.textContent = 'A calcular cobrança no aceite…';
    const dc = await fetchCotacao(km);
    el.textContent = textoCotacao(dc);
    return dc;
  }

  /**
   * @param {{ inputId: string, previewId: string, onChange?: (dc: object|null) => void }} opts
   */
  function bind(opts) {
    const input = document.getElementById(opts.inputId);
    const preview = document.getElementById(opts.previewId);
    if (!input || !preview) return;

    let timer = null;
    async function refresh() {
      const dc = await renderInto(preview, input.value);
      if (typeof opts.onChange === 'function') opts.onChange(dc);
    }
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 280);
    }
    input.addEventListener('input', schedule);
    input.addEventListener('change', refresh);
    refresh();
  }

  g.GUIA_ME_cobrancaAceite = { bind, fetchCotacao, renderInto, textoCotacao, fmtBRL };
})(typeof window !== 'undefined' ? window : globalThis);
