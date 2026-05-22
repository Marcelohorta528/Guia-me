const KEY_STORAGE = 'guiame_admin_key';

const $ = (id) => document.getElementById(id);

function formatBrl(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function partyCell(p) {
  if (!p) return '<span class="admin-money--empty">—</span>';
  const tel = p.telefone ? `<br><span class="muted small">${p.telefone}</span>` : '';
  return `<span class="cell-wrap"><strong>${escapeHtml(p.nome)}</strong>${tel}</span>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgeClass(status) {
  if (status === 'novo') return 'admin-badge--novo';
  if (status === 'aceito') return 'admin-badge--aceito';
  if (status === 'concluido') return 'admin-badge--concluido';
  return '';
}

let allTransacoes = [];

function renderStats(stats) {
  const el = $('stats');
  const items = [
    ['Total', stats.total],
    ['Na fila', stats.novo],
    ['Em negociação', stats.aceito],
    ['Concluídos', stats.concluido],
  ];
  el.innerHTML = items
    .map(
      ([label, n]) =>
        `<div class="admin-stat"><strong>${n}</strong><span>${label}</span></div>`,
    )
    .join('');
}

function applyFilters() {
  const status = $('filter-status').value;
  const q = $('filter-search').value.trim().toLowerCase();
  let rows = allTransacoes;
  if (status) rows = rows.filter((t) => t.status === status);
  if (q) {
    rows = rows.filter((t) => {
      const blob = [
        t.id,
        t.status,
        t.status_label,
        t.cidade,
        t.bairro,
        t.descricao,
        t.cliente?.nome,
        t.cliente?.telefone,
        t.prestador?.nome,
        t.prestador?.telefone,
        ...(t.servicos || []),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }
  renderTable(rows);
}

function renderTable(rows) {
  const tbody = $('tbody');
  const empty = $('empty');
  const wrap = $('table-wrap');

  if (!rows.length) {
    tbody.innerHTML = '';
    wrap.hidden = true;
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  wrap.hidden = false;
  const v = (t) => t.valores || {};

  tbody.innerHTML = rows
    .map((t) => {
      const val = v(t);
      return `<tr>
        <td>${formatDate(t.createdAt)}</td>
        <td>${partyCell(t.cliente)}</td>
        <td>${partyCell(t.prestador)}</td>
        <td><span class="admin-badge ${badgeClass(t.status)}">${escapeHtml(t.status_label || t.status)}</span></td>
        <td class="cell-wrap">${escapeHtml(t.cidade)}<br><span class="muted small">${escapeHtml(t.bairro)}</span></td>
        <td class="admin-money">${formatBrl(val.valor_efetivo_servico ?? val.valor_servico)}</td>
        <td class="admin-money">${formatBrl(val.orcamento_valor)}</td>
        <td class="admin-money">${formatBrl(val.taxa_deslocamento_reais)}</td>
        <td class="admin-money">${formatBrl(val.taxa_aceite_total_reais)}</td>
        <td class="admin-money">${formatBrl(val.comissao_app_reais)}</td>
        <td class="admin-money">${formatBrl(val.liquido_prestador_servico)}</td>
        <td class="admin-money">${formatBrl(val.taxa_prestador_fechamento_reais)}</td>
      </tr>`;
    })
    .join('');
}

async function loadTransacoes(key) {
  $('loading').hidden = false;
  $('empty').hidden = true;
  $('table-wrap').hidden = true;
  $('auth-error').hidden = true;

  const res = await fetch(`/api/admin/transacoes?key=${encodeURIComponent(key)}`);
  const data = await res.json().catch(() => ({}));

  $('loading').hidden = true;

  if (!res.ok || !data.ok) {
    $('auth-error').textContent = data.error || 'Erro ao carregar transações';
    $('auth-error').hidden = false;
    $('auth-panel').hidden = false;
    $('dashboard').hidden = true;
    sessionStorage.removeItem(KEY_STORAGE);
    return;
  }

  sessionStorage.setItem(KEY_STORAGE, key);
  $('auth-panel').hidden = true;
  $('dashboard').hidden = false;
  allTransacoes = data.transacoes || [];
  renderStats(data.stats || { total: 0, novo: 0, aceito: 0, concluido: 0 });
  applyFilters();
}

function enter() {
  const key = $('admin-key').value.trim();
  if (!key) {
    $('auth-error').textContent = 'Informe a chave de administrador';
    $('auth-error').hidden = false;
    return;
  }
  loadTransacoes(key);
}

$('btn-enter').addEventListener('click', enter);
$('admin-key').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enter();
});
$('filter-status').addEventListener('change', applyFilters);
$('filter-search').addEventListener('input', applyFilters);

const saved = sessionStorage.getItem(KEY_STORAGE);
if (saved) {
  $('admin-key').value = saved;
  loadTransacoes(saved);
}
