/**
 * Histórico local de descrições de pedido (cliente / protótipo).
 * Guarda neste dispositivo até 12 textos distintos (mais recentes primeiro).
 */
(function () {
  const KEY = 'guiame_cliente_descricoes_pedido';
  const MAX = 12;
  const MIN_SAVE = 3;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map((s) => String(s).trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  function save(desc) {
    const t = String(desc || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length < MIN_SAVE) return;
    const lower = t.toLowerCase();
    const prev = load().filter((x) => x.toLowerCase() !== lower);
    const next = [t, ...prev].slice(0, MAX);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* quota ou modo privado */
    }
  }

  function render(wrap, listEl, textarea) {
    if (!wrap || !listEl || !textarea) return;
    const items = load();
    listEl.innerHTML = '';
    if (!items.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    items.forEach((text) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pedido-desc-historico-item';
      const short = text.length > 100 ? `${text.slice(0, 97)}…` : text;
      btn.textContent = short;
      btn.title = text;
      btn.addEventListener('click', () => {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
      });
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  window.GUIA_ME_pedidoDescricaoHistorico = { load, save, render };
})();
