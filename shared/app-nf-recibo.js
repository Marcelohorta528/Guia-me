/**
 * NF / recibo em PDF: prestador envia, cliente recebe (Conta e preferências + pedidos).
 */
(function (g) {
  const MAX_BYTES = 1_500_000;

  function token() {
    return sessionStorage.getItem('guiame_auth_token');
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || '');
        const i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = () => reject(new Error('Não foi possível ler o PDF'));
      r.readAsDataURL(file);
    });
  }

  async function fetchListaConta() {
    const t = token();
    if (!t) return [];
    const r = await fetch('/api/conta/documentos-fiscais', {
      headers: { Authorization: 'Bearer ' + t },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Erro ao listar documentos');
    return Array.isArray(d.documentos) ? d.documentos : [];
  }

  async function downloadDoc(pedidoId, nome) {
    const t = token();
    if (!t) throw new Error('Faça login para descarregar');
    const r = await fetch('/api/pedidos/' + pedidoId + '/documento-fiscal', {
      headers: { Authorization: 'Bearer ' + t },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.pdf_base64) throw new Error(d.error || 'Documento indisponível');
    const a = document.createElement('a');
    a.href = 'data:application/pdf;base64,' + d.pdf_base64;
    a.download = nome || d.nome || 'documento.pdf';
    a.click();
  }

  function fmtDataBr(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return String(iso).slice(0, 10);
    }
  }

  function appendGarantiaServicoBox(li, p) {
    if (!p || String(p.status) !== 'concluido' || p.concluido_via !== 'documento_fiscal') return;
    const box = document.createElement('div');
    box.className = 'pedido-garantia-box';
    const tit = document.createElement('p');
    tit.className = 'muted small';
    const sb = document.createElement('strong');
    sb.textContent = 'Serviço concluído com garantia';
    tit.appendChild(sb);
    tit.appendChild(
      document.createTextNode(
        ' — após envio de NF/recibo pelo prestador (garantia de até ' +
          (p.garantia_meses || 3) +
          ' meses).',
      ),
    );
    box.appendChild(tit);
    const p1 = document.createElement('p');
    p1.className = 'muted small';
    p1.textContent =
      'Concluído em ' +
      fmtDataBr(p.servico_concluido_at || p.concluidoAt) +
      ' · garantia válida até ' +
      fmtDataBr(p.garantia_ate) +
      '.';
    box.appendChild(p1);
    li.appendChild(box);
  }

  function renderLista(ul, docs, role) {
    if (!ul) return;
    ul.innerHTML = '';
    if (!docs.length) {
      const li = document.createElement('li');
      li.className = 'muted small';
      li.textContent =
        role === 'cliente'
          ? 'Ainda não recebeu NF ou recibo em PDF.'
          : 'Ainda não enviou NF ou recibo em PDF.';
      ul.appendChild(li);
      return;
    }
    for (const doc of docs) {
      const li = document.createElement('li');
      li.className = 'app-nf-doc-item';
      const tit = document.createElement('span');
      tit.textContent =
        (doc.nome || 'documento.pdf') +
        ' · pedido ' +
        String(doc.pedido_id || '').slice(0, 8) +
        '… · ' +
        fmtDataBr(doc.enviado_at) +
        (doc.garantia_ate ? ' · garantia até ' + fmtDataBr(doc.garantia_ate) : '');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-small btn-secondary';
      btn.textContent = role === 'cliente' ? 'Abrir PDF' : 'Ver PDF enviado';
      btn.addEventListener('click', () =>
        downloadDoc(doc.pedido_id, doc.nome).catch((e) => alert(e.message || String(e))),
      );
      li.appendChild(tit);
      li.appendChild(btn);
      ul.appendChild(li);
    }
  }

  /**
   * @param {{ listaId: string, pedidoSelectId: string, fileInputId: string, feedbackId: string, role: 'prestador'|'cliente' }} opts
   */
  function initConta(opts) {
    const ul = document.getElementById(opts.listaId);
    const sel = opts.pedidoSelectId ? document.getElementById(opts.pedidoSelectId) : null;
    const inp = opts.fileInputId ? document.getElementById(opts.fileInputId) : null;
    const fb = document.getElementById(opts.feedbackId);
    const btnEnv =
      opts.role === 'prestador' ? document.getElementById(opts.enviarBtnId) : null;

    async function refreshLista() {
      if (!token()) {
        if (ul) ul.innerHTML = '<li class="muted small">Faça login para ver documentos.</li>';
        return;
      }
      try {
        const docs = await fetchListaConta();
        renderLista(ul, docs, opts.role);
      } catch (e) {
        if (ul) ul.innerHTML = '<li class="muted small">' + (e.message || e) + '</li>';
      }
    }

    async function loadPedidosSelect() {
      if (!sel || opts.role !== 'prestador') return;
      const t = token();
      if (!t) {
        sel.innerHTML = '<option value="">Login necessário</option>';
        return;
      }
      const r = await fetch('/api/pedidos', { headers: { Authorization: 'Bearer ' + t } });
      const d = await r.json().catch(() => ({}));
      sel.innerHTML = '<option value="">Selecione o pedido…</option>';
      const list = Array.isArray(d.meus_pedidos) ? d.meus_pedidos : [];
      for (const p of list) {
        if (String(p.status) !== 'aceito' && String(p.status) !== 'concluido') continue;
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent =
          'Pedido ' +
          String(p.id).slice(0, 8) +
          '… · ' +
          (p.status || '') +
          (p.tem_documento_fiscal ? ' · PDF já enviado' : '');
        sel.appendChild(o);
      }
    }

    async function enviar() {
      if (!inp || !btnEnv) return;
      const pedidoId = sel?.value?.trim();
      const file = inp.files?.[0];
      if (!pedidoId) {
        if (fb) fb.textContent = 'Selecione o pedido.';
        return;
      }
      if (!file) {
        if (fb) fb.textContent = 'Selecione o PDF (NF ou recibo).';
        return;
      }
      const arq = g.GUIA_ME_arquivos;
      if (arq && !arq.isPdf(file)) {
        if (fb) fb.textContent = 'Apenas PDF é aceite.';
        return;
      }
      if (file.size > MAX_BYTES) {
        if (fb) fb.textContent = 'PDF demasiado grande (máx. ~1,5 MB).';
        return;
      }
      if (fb) fb.textContent = 'A enviar…';
      try {
        const b64 = await readFileAsBase64(file);
        const t = token();
        const r = await fetch('/api/pedidos/' + pedidoId + '/documento-fiscal', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + t,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ nome: file.name, pdf_base64: b64 }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Erro ao enviar');
        if (fb) {
          let msg = 'NF/recibo enviado ao cliente: ' + (d.documento?.nome || file.name);
          if (d.servico_concluido) {
            msg +=
              ' · Serviço concluído · garantia até ' +
              fmtDataBr(d.garantia_ate) +
              ' (' +
              (d.garantia_meses || 3) +
              ' meses)';
          }
          if (d.taxa_prestador_fechamento?.reais != null) {
            msg +=
              ' · Taxa plataforma: R$ ' +
              Number(d.taxa_prestador_fechamento.reais).toFixed(2).replace('.', ',');
          }
          fb.textContent = msg;
        }
        inp.value = '';
        await refreshLista();
        await loadPedidosSelect();
      } catch (e) {
        if (fb) fb.textContent = e.message || String(e);
      }
    }

    if (btnEnv && !btnEnv.dataset.nfBound) {
      btnEnv.dataset.nfBound = '1';
      btnEnv.addEventListener('click', enviar);
    }
    refreshLista();
    loadPedidosSelect();

    return { refreshLista, loadPedidosSelect };
  }

  /**
   * Bloco compacto num cartão de pedido.
   */
  function appendPedidoDocFiscalRow(li, p, role) {
    if (!p || !p.id) return;
    const wrap = document.createElement('div');
    wrap.className = 'pedido-nf-doc-wrap';
    const tit = document.createElement('p');
    tit.className = 'muted small';
    const sb = document.createElement('strong');
    sb.textContent = role === 'prestador' ? 'NF / recibo (concluir serviço)' : 'NF / recibo recebido';
    tit.appendChild(sb);
    wrap.appendChild(tit);

    if (String(p.status) === 'concluido' && p.concluido_via === 'documento_fiscal') {
      const pg = document.createElement('p');
      pg.className = 'muted small';
      pg.textContent =
        'Serviço concluído · garantia até ' +
        fmtDataBr(p.garantia_ate) +
        ' (' +
        (p.garantia_meses || 3) +
        ' meses).';
      wrap.appendChild(pg);
    }

    if (p.tem_documento_fiscal) {
      const p1 = document.createElement('p');
      p1.className = 'muted small';
      p1.textContent =
        (p.documento_fiscal_nome || 'documento.pdf') +
        ' · enviado em ' +
        (p.documento_fiscal_enviado_at || '—');
      wrap.appendChild(p1);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-small btn-secondary';
      btn.textContent = 'Abrir PDF';
      btn.addEventListener('click', () =>
        downloadDoc(p.id, p.documento_fiscal_nome).catch((e) => alert(e.message || String(e))),
      );
      wrap.appendChild(btn);
    } else if (role === 'cliente') {
      const p2 = document.createElement('p');
      p2.className = 'muted small';
      p2.textContent =
        'O prestador ainda não enviou NF/recibo — o serviço só fica concluído após esse envio (com garantia de até 3 meses).';
      wrap.appendChild(p2);
    } else if (String(p.status) === 'aceito') {
      const p2 = document.createElement('p');
      p2.className = 'muted small';
      p2.textContent =
        'Envie NF ou recibo em PDF para concluir o serviço e ativar garantia de até 3 meses (Conta → NF e recibos).';
      wrap.appendChild(p2);
    } else {
      const p2 = document.createElement('p');
      p2.className = 'muted small';
      p2.textContent = 'Disponível após aceitar o pedido.';
      wrap.appendChild(p2);
    }
    li.appendChild(wrap);
  }

  g.GUIA_ME_nfRecibo = {
    initConta,
    appendPedidoDocFiscalRow,
    appendGarantiaServicoBox,
    downloadDoc,
    refreshListaConta: fetchListaConta,
    fmtDataBr,
  };
})(typeof window !== 'undefined' ? window : globalThis);
