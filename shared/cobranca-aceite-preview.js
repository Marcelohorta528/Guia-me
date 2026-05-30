/**
 * Prévia no aceite: cliente paga desloc. + diária ao prestador; prestador paga R$ 9,90 à plataforma.
 */
(function (g) {
  function fmtBRL(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return 'R$ ' + Number(n).toFixed(2).replace('.', ',');
  }

  function buildQuery(km, diaria) {
    const params = [];
    const rawKm = String(km ?? '').trim().replace(',', '.');
    if (rawKm && Number.isFinite(Number(rawKm))) params.push('km=' + encodeURIComponent(rawKm));
    const rawDi = String(diaria ?? '').trim().replace(',', '.');
    if (rawDi && Number.isFinite(Number(rawDi)) && Number(rawDi) > 0) {
      params.push('diaria=' + encodeURIComponent(rawDi));
    }
    return params.length ? '?' + params.join('&') : '';
  }

  async function fetchCotacao(km, diaria) {
    try {
      const r = await fetch('/api/taxa-aceite/cotacao' + buildQuery(km, diaria));
      if (!r.ok) return null;
      return r.json();
    } catch {
      return null;
    }
  }

  function textoCotacao(dc) {
    if (!dc || dc.total_reais == null) {
      return (
        'No aceite: cliente paga ao prestador deslocamento (R$ 1,50/km) + diária combinada; ' +
        'prestador paga à plataforma R$ 9,90.'
      );
    }
    const d = dc.deslocamento;
    const di = dc.diaria;
    const pl = dc.plataforma;
    const parts = ['No aceite do prestador:'];
    if (d) {
      parts.push(
        'Cliente → prestador, deslocamento ' +
          (d.descricao || '') +
          ' = ' +
          fmtBRL(d.reais),
      );
    }
    if (di) {
      parts.push(
        'Cliente → prestador, ' +
          (di.descricao || 'diária combinada') +
          (di.reais > 0 ? ': ' + fmtBRL(di.reais) : ' (valor a combinar)'),
      );
    }
    parts.push('Total debitado do cliente: ' + fmtBRL(dc.total_reais) + '.');
    if (pl) {
      const taxaPlataforma = pl.taxa_plataforma_reais != null ? pl.taxa_plataforma_reais : pl.reais;
      parts.push('Prestador → plataforma Guia-me: ' + fmtBRL(taxaPlataforma) + '.');
    }
    return parts.join(' ');
  }

  async function renderInto(el, km, diaria) {
    if (!el) return null;
    el.textContent = 'A calcular cobrança no aceite…';
    const dc = await fetchCotacao(km, diaria);
    el.textContent = textoCotacao(dc);
    return dc;
  }

  function bind(opts) {
    const input = document.getElementById(opts.inputId);
    const preview = document.getElementById(opts.previewId);
    const diariaInput = opts.diariaInputId ? document.getElementById(opts.diariaInputId) : null;
    if (!input || !preview) return;

    let timer = null;
    async function refresh() {
      const dc = await renderInto(preview, input.value, diariaInput ? diariaInput.value : undefined);
      if (typeof opts.onChange === 'function') opts.onChange(dc);
    }
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 280);
    }
    input.addEventListener('input', schedule);
    input.addEventListener('change', refresh);
    if (diariaInput) {
      diariaInput.addEventListener('input', schedule);
      diariaInput.addEventListener('change', refresh);
    }
    refresh();
  }

  g.GUIA_ME_cobrancaAceite = { bind, fetchCotacao, renderInto, textoCotacao, fmtBRL };
})(typeof window !== 'undefined' ? window : globalThis);
