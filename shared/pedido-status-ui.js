/**
 * Rótulos de estado do pedido — fila de espera até aceite inicial de negociação.
 */
(function (g) {
  function emFilaEspera(p) {
    if (!p) return false;
    return String(p.status || 'novo') === 'novo' && !p.prestadorId;
  }

  function labelStatus(status, pedido) {
    const p = pedido || { status };
    if (p.status_label) return p.status_label;
    if (emFilaEspera(p)) return 'Na fila de espera';
    const st = String(status || p.status || 'novo');
    if (st === 'aceito') return 'Em negociação';
    if (st === 'concluido') return 'Concluído';
    return st;
  }

  function descricaoStatus(p) {
    if (p?.status_descricao) return p.status_descricao;
    if (emFilaEspera(p)) {
      return 'Aguardando aceite inicial de negociação por um prestador na sua área.';
    }
    const st = String(p?.status || '');
    if (st === 'aceito') {
      return 'Aceite inicial dado; orçamento, chat e acordo de valor seguem nesta fase.';
    }
    if (st === 'concluido') return 'Serviço concluído após NF/recibo do prestador.';
    return '';
  }

  function textoEstadoLinha(p) {
    return 'Estado: ' + labelStatus(p?.status, p);
  }

  g.GUIA_ME_pedidoStatus = {
    emFilaEspera,
    labelStatus,
    descricaoStatus,
    textoEstadoLinha,
  };
})(window);
