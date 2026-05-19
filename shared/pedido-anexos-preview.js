/**
 * Pré-visualização local de anexos do pedido (imagens + PDF, até 8 ficheiros).
 */
(function () {
  const arq = () => window.GUIA_ME_arquivos;

  /**
   * @param {string} inputId
   * @param {string} previewId
   * @returns {{ clear: () => void }}
   */
  function bindFotosPreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) {
      return {
        clear() {
          /* noop */
        },
      };
    }

    const tipo = input.getAttribute('data-file-accept') || 'imagens-pdf';

    function revokeAll() {
      preview.querySelectorAll('img').forEach((img) => {
        if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      });
      preview.innerHTML = '';
    }

    function refresh() {
      revokeAll();
      const a = arq();
      [...(input.files || [])].slice(0, 8).forEach((file) => {
        if (a && !a.isAceito(tipo, file)) return;
        if (a && a.isImagem(file)) {
          const url = URL.createObjectURL(file);
          const img = document.createElement('img');
          img.src = url;
          img.alt = file.name;
          img.className = 'pedido-foto-thumb';
          img.loading = 'lazy';
          preview.appendChild(img);
          return;
        }
        if (a && a.isPdf(file)) {
          const chip = document.createElement('span');
          chip.className = 'pedido-anexo-pdf';
          chip.title = file.name;
          chip.textContent = '📄 ' + (file.name.length > 22 ? file.name.slice(0, 19) + '…' : file.name);
          preview.appendChild(chip);
        }
      });
    }

    input.addEventListener('change', refresh);
    return {
      clear() {
        input.value = '';
        revokeAll();
      },
    };
  }

  window.GUIA_ME_pedidoAnexos = { bindFotosPreview };
})();
