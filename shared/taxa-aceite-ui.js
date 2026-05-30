/**
 * UI no aceite: cliente paga desloc. + diária ao prestador; prestador paga R$ 9,90 à plataforma.
 */
(function (g) {
  const TAXA_KM = 1.5;
  const TAXA_PLATAFORMA = 9.9;
  function fmtBRL(n) {
    if (n == null || n === '' || !Number.isFinite(Number(n))) return null;
    return 'R$ ' + Number(n).toFixed(2).replace('.', ',');
  }

  function metodoLabel(m) {
    if (m === 'saldo') return 'saldo da conta';
    if (m === 'cartao') return 'cartão cadastrado';
    return m || '—';
  }

  function linhasCobrancaAceite(p) {
    const desloc =
      p.taxa_aceite_deslocamento_reais != null
        ? Number(p.taxa_aceite_deslocamento_reais)
        : p.taxa_deslocamento_reais != null
          ? Number(p.taxa_deslocamento_reais)
          : null;
    const diaria =
      p.taxa_aceite_diaria_reais != null
        ? Number(p.taxa_aceite_diaria_reais)
        : p.orcamentoValor != null
          ? Number(p.orcamentoValor)
          : p.valor_servico != null
            ? Number(p.valor_servico)
            : null;
    const plataforma =
      p.taxa_aceite_plataforma_reais != null
        ? Number(p.taxa_aceite_plataforma_reais)
        : null;
    const total =
      p.taxa_aceite_total_reais != null
        ? Number(p.taxa_aceite_total_reais)
        : p.taxa_aceite_reais != null
          ? Number(p.taxa_aceite_reais)
          : null;
    const kmIda = p.km_deslocamento != null ? Number(p.km_deslocamento) : null;
    const kmFat =
      p.taxa_aceite_km_faturados != null
        ? Number(p.taxa_aceite_km_faturados)
        : kmIda != null
          ? Math.round(kmIda * 2 * 100) / 100
          : null;
    const credito =
      p.taxa_aceite_credito_reais != null
        ? Number(p.taxa_aceite_credito_reais)
        : plataforma;
    const usd =
      p.taxa_aceite_usd != null && Number.isFinite(Number(p.taxa_aceite_usd))
        ? Number(p.taxa_aceite_usd).toFixed(2)
        : null;
    const cambio =
      p.taxa_aceite_cambio_usd_brl != null && Number.isFinite(Number(p.taxa_aceite_cambio_usd_brl))
        ? Number(p.taxa_aceite_cambio_usd_brl).toFixed(4)
        : '—';
    return {
      desloc,
      diaria,
      plataforma,
      credito,
      total,
      kmIda,
      kmFat,
      usd,
      cambio,
      prestadorMetodo: p.taxa_aceite_prestador_metodo || null,
    };
  }

  function textoResumoCobrancaAceite(p) {
    const x = linhasCobrancaAceite(p);
    const parts = [];
    if (x.desloc != null && x.kmIda != null && x.kmFat != null) {
      parts.push(
        'Cliente → prestador, deslocamento: ' +
          x.kmIda +
          ' km ida → ' +
          x.kmFat +
          ' km × R$ ' +
          TAXA_KM.toFixed(2).replace('.', ',') +
          '/km = ' +
          fmtBRL(x.desloc),
      );
    } else if (x.desloc != null) {
      parts.push('Cliente → prestador, deslocamento: ' + fmtBRL(x.desloc));
    }
    if (x.diaria != null && x.diaria > 0) {
      parts.push('Cliente → prestador, diária: ' + fmtBRL(x.diaria));
    } else {
      parts.push('Diária combinada: a definir');
    }
    if (x.total != null) parts.push('Total do cliente: ' + fmtBRL(x.total));
    if (x.plataforma != null) {
      parts.push('Prestador → plataforma: ' + fmtBRL(x.plataforma));
    } else {
      parts.push('Prestador → plataforma: R$ ' + TAXA_PLATAFORMA.toFixed(2).replace('.', ','));
    }
    return parts.join(' · ');
  }

  /**
   * @param {HTMLElement} li
   * @param {object} p pedido da API
   * @param {'cliente'|'prestador'} role
   */
  function appendTaxaAceiteBox(li, p, role) {
    if (!p || !p.taxa_aceite_cobrada_at) return;
    const x = linhasCobrancaAceite(p);
    const box = document.createElement('div');
    box.className = 'pedido-orcamento-box pedido-taxa-aceite';
    const tit = document.createElement('p');
    tit.className = 'muted small';
    const sb = document.createElement('strong');
    sb.textContent = role === 'cliente' ? 'Cobrança no aceite (cliente)' : 'Cobrança no aceite';
    tit.appendChild(sb);
    tit.appendChild(
      document.createTextNode(
        role === 'cliente'
          ? ' — deslocamento + diária combinada debitados do seu saldo ou cartão.'
          : ' — cliente paga deslocamento + diária; prestador paga taxa da plataforma.',
      ),
    );
    box.appendChild(tit);

    if (x.desloc != null) {
      const pd = document.createElement('p');
      pd.className = 'muted small';
      let t = '1) Deslocamento (cliente → prestador): ';
      if (x.kmIda != null && x.kmFat != null) {
        t +=
          x.kmIda +
          ' km (só ida) → ' +
          x.kmFat +
          ' km ida e volta × R$ ' +
          TAXA_KM.toFixed(2).replace('.', ',') +
          '/km = ' +
          (fmtBRL(x.desloc) || '—');
      } else {
        t += fmtBRL(x.desloc) || '—';
      }
      pd.textContent = t;
      box.appendChild(pd);
    }

    const pDi = document.createElement('p');
    pDi.className = 'muted small';
    if (x.diaria != null && x.diaria > 0) {
      pDi.textContent = '2) Diária combinada (cliente → prestador): ' + (fmtBRL(x.diaria) || '—');
    } else {
      pDi.textContent = '2) Diária combinada (cliente → prestador): a definir na negociação';
    }
    box.appendChild(pDi);

    const pt = document.createElement('p');
    pt.className = 'muted small';
    const st = document.createElement('strong');
    st.textContent = 'Total debitado do cliente: ' + (fmtBRL(x.total) || '—');
    pt.appendChild(st);
    if (role === 'cliente' && p.taxa_aceite_metodo) {
      pt.appendChild(document.createTextNode(' · em ' + metodoLabel(p.taxa_aceite_metodo)));
    }
    pt.appendChild(document.createTextNode(' · ' + (p.taxa_aceite_cobrada_at || '—')));
    box.appendChild(pt);

    const pp = document.createElement('p');
    pp.className = 'muted small';
    const taxaPlat = x.plataforma != null ? x.plataforma : TAXA_PLATAFORMA;
    pp.textContent =
      'Taxa plataforma Guia-me (prestador → plataforma): ' +
      (fmtBRL(taxaPlat) || '—') +
      (role === 'prestador' && x.prestadorMetodo
        ? ' · débito em: ' + metodoLabel(x.prestadorMetodo)
        : '');
    box.appendChild(pp);

    const pPrest = document.createElement('p');
    pPrest.className = 'muted small';
    const recebePrest =
      (x.desloc != null ? x.desloc : 0) + (x.diaria != null && x.diaria > 0 ? x.diaria : 0);
    pPrest.textContent =
      'Prestador recebe do cliente: deslocamento + diária' +
      (recebePrest > 0 ? ' = ' + (fmtBRL(recebePrest) || '—') : ' (diária a combinar).');
    box.appendChild(pPrest);

    li.appendChild(box);
  }

  function appendTaxaPrestadorFechamentoBox(li, p, role) {
    if (!p || !p.taxa_prestador_fechamento_cobrada_at) return;
    const box = document.createElement('div');
    box.className = 'pedido-orcamento-box pedido-taxa-prestador-fechamento';
    const tit = document.createElement('p');
    tit.className = 'muted small';
    const sb = document.createElement('strong');
    sb.textContent = 'Taxa de fechamento (prestador)';
    tit.appendChild(sb);
    tit.appendChild(
      document.createTextNode(
        role === 'prestador'
          ? ' — debitada do seu saldo ou cartão ao concluir o pedido (ambas as partes confirmaram o fechamento).'
          : ' — cobrada do prestador ao final (US$ 10 convertidos para real, câmbio do dia, arredondado para cima).',
      ),
    );
    box.appendChild(tit);
    const br = fmtBRL(p.taxa_prestador_fechamento_reais);
    const usd =
      p.taxa_prestador_fechamento_usd != null && Number.isFinite(Number(p.taxa_prestador_fechamento_usd))
        ? Number(p.taxa_prestador_fechamento_usd).toFixed(2)
        : '10.00';
    const cambio =
      p.taxa_prestador_fechamento_cambio_usd_brl != null &&
      Number.isFinite(Number(p.taxa_prestador_fechamento_cambio_usd_brl))
        ? Number(p.taxa_prestador_fechamento_cambio_usd_brl).toFixed(4)
        : '—';
    const p1 = document.createElement('p');
    p1.className = 'muted small';
    p1.textContent =
      'US$ ' +
      usd +
      ' × câmbio ' +
      cambio +
      ' USD/BRL → ' +
      (br || '—') +
      (role === 'prestador' && p.taxa_prestador_fechamento_metodo
        ? ' · débito em: ' + metodoLabel(p.taxa_prestador_fechamento_metodo)
        : '') +
      ' · em ' +
      (p.taxa_prestador_fechamento_cobrada_at || '—');
    box.appendChild(p1);
    li.appendChild(box);
  }

  g.guiameAppendTaxaAceiteBox = appendTaxaAceiteBox;
  g.guiameAppendTaxaPrestadorFechamentoBox = appendTaxaPrestadorFechamentoBox;
  g.guiameFmtBRLTaxaAceite = fmtBRL;
  g.guiameTextoResumoCobrancaAceite = textoResumoCobrancaAceite;
})(typeof window !== 'undefined' ? window : globalThis);
