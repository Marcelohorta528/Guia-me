/**
 * Comentários recentes no portal (abaixo da imagem).
 */
(function () {
  const MOCK = [
    {
      authorLabel: 'Ana M.',
      rating: 5,
      sugestao: 'Elétrica Copacabana LTDA',
      servicos: ['Eletricista'],
      comment: 'Chegou no horário e resolveu a instalação. Recomendo esta empresa para quem precisa de eletricista na Zona Sul.',
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      authorLabel: 'João P.',
      rating: 5,
      sugestao: 'Marcio Instalações',
      servicos: ['Encanador'],
      comment: 'Vazamento resolvido no mesmo dia. Profissional pontual — sugiro o Marcio para serviços hidráulicos.',
      createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    },
    {
      authorLabel: 'Carla S.',
      rating: 4,
      sugestao: 'Refrigeração Zona Sul',
      servicos: ['Ar-condicionado'],
      comment: 'Orçamento claro pelo app e manutenção impecável. Indico a empresa para refrigeração.',
      createdAt: new Date(Date.now() - 9 * 3600000).toISOString(),
    },
    {
      authorLabel: 'Roberto L.',
      rating: 5,
      sugestao: 'Pinturas & Acabamentos Rio',
      servicos: ['Pintor'],
      comment: 'Entregou antes do prazo e deixou o apartamento perfeito. Empresa séria, vale a indicação.',
      createdAt: new Date(Date.now() - 14 * 3600000).toISOString(),
    },
    {
      authorLabel: 'Fernanda R.',
      rating: 5,
      sugestao: 'Tech Home Instalações',
      servicos: ['Eletricista', 'Câmeras'],
      comment: 'Indico a Tech Home para instalação de câmeras — trabalho limpo e preço justo pelo app.',
      createdAt: new Date(Date.now() - 20 * 3600000).toISOString(),
    },
  ];

  function stars(n) {
    const full = Math.max(0, Math.min(5, Number(n) || 0));
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  function timeAgo(iso) {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const h = Math.floor(diff / 3600000);
      if (h < 1) return 'agora há pouco';
      if (h < 24) return `há ${h} h`;
      const d = Math.floor(h / 24);
      return `há ${d} dia${d > 1 ? 's' : ''}`;
    } catch {
      return '';
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCard(r) {
    const tags =
      Array.isArray(r.servicos) && r.servicos.length
        ? r.servicos.map((s) => `<span class="portal-review__tag">${escapeHtml(s)}</span>`).join('')
        : '';
    return `<article class="portal-review">
      <header class="portal-review__head">
        <div>
          <strong class="portal-review__author">${escapeHtml(r.authorLabel)}</strong>
          <span class="portal-review__time muted small">${escapeHtml(timeAgo(r.createdAt))}</span>
        </div>
        <span class="portal-review__stars" aria-label="Nota ${r.rating} de 5">${stars(r.rating)}</span>
      </header>
      <p class="portal-review__sugestao">Sugere: <strong>${escapeHtml(r.sugestao)}</strong></p>
      ${tags ? `<div class="portal-review__tags">${tags}</div>` : ''}
      <p class="portal-review__text">${escapeHtml(r.comment)}</p>
    </article>`;
  }

  function render(list) {
    const el = document.getElementById('portal-reviews-list');
    if (!el) return;
    const items = list.length ? list : MOCK;
    el.innerHTML = items.map(renderCard).join('');
  }

  async function load() {
    try {
      const res = await fetch('/api/avaliacoes/recentes?limit=6');
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.reviews) && data.reviews.length) {
        render(data.reviews);
        return;
      }
    } catch {
      /* demo */
    }
    render(MOCK);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
