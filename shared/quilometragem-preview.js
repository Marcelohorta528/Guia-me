/**
 * Pré-visualização de km (ida) e taxa ida+volta (R$ 2,00/km por omissão).
 */
(function (g) {
  const TAXA_KM = 2;

  /**
   * @param {object} opts
   * @param {string} opts.inputId — campo km (só ida)
   * @param {string} opts.previewId — elemento de texto
   * @param {number} [opts.maxKm]
   * @param {string} [opts.labelContext] — ex. "do pedido" | "máx. que você atende"
   */
  function bind(opts) {
    const input = document.getElementById(opts.inputId);
    const preview = document.getElementById(opts.previewId);
    if (!input || !preview) return;

    const maxKm = opts.maxKm ?? 150;
    const ctx = opts.labelContext ? ` ${opts.labelContext}` : '';

    function refresh() {
      const raw = String(input.value ?? '').trim().replace(',', '.');
      if (!raw) {
        preview.textContent =
          `Informe os km${ctx} (só ida, máx. ${maxKm}). Taxa de deslocamento: R$ ${TAXA_KM.toFixed(2).replace('.', ',')}/km × ida e volta.`;
        return;
      }
      const k = Number(raw);
      if (!Number.isFinite(k) || k < 0) {
        preview.textContent = 'Valor de km inválido.';
        return;
      }
      const kmIda = Math.min(maxKm, Math.max(0, k));
      const kmFaturados = kmIda * 2;
      const taxa = Math.round(kmFaturados * TAXA_KM * 100) / 100;
      preview.textContent = `Km ida${ctx}: ${kmIda} → ida e volta: ${kmFaturados} km faturados × R$ ${TAXA_KM.toFixed(2).replace('.', ',')}/km ≈ R$ ${taxa.toFixed(2).replace('.', ',')} de deslocamento (soma-se US$ 5 plataforma no aceite — ver prévia abaixo).`;
    }

    input.addEventListener('input', refresh);
    input.addEventListener('change', refresh);
    refresh();
  }

  g.GUIA_ME_quilometragem = { bind, TAXA_KM };
})(window);
