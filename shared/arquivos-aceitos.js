/**
 * Extensões e MIME aceites nos uploads do Guia-me (MVP).
 * Uso: data-file-accept="imagens" | "imagens-pdf" no <input type="file">.
 */
(function (g) {
  const ACCEPT_IMAGENS =
    'image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/bmp,' +
    '.jpg,.jpeg,.png,.webp,.gif,.heic,.bmp';

  const ACCEPT_IMAGENS_PDF = ACCEPT_IMAGENS + ',application/pdf,.pdf';
  const ACCEPT_PDF = 'application/pdf,.pdf';

  const HINT_IMAGENS = 'JPG, JPEG, PNG, WebP, GIF, HEIC ou BMP';
  const HINT_IMAGENS_PDF = HINT_IMAGENS + ' e PDF';
  const HINT_PDF = 'PDF (NF ou recibo, máx. ~1,5 MB)';

  function isImagem(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    return /\.(jpe?g|png|webp|gif|heic|bmp)$/i.test(file.name || '');
  }

  function isPdf(file) {
    if (!file) return false;
    if (file.type === 'application/pdf') return true;
    return /\.pdf$/i.test(file.name || '');
  }

  function isAceito(tipo, file) {
    if (!file) return false;
    if (tipo === 'imagens') return isImagem(file);
    if (tipo === 'pdf') return isPdf(file);
    if (tipo === 'imagens-pdf') return isImagem(file) || isPdf(file);
    return isImagem(file) || isPdf(file);
  }

  function aplicarAccepts() {
    document.querySelectorAll('input[type="file"][data-file-accept]').forEach((input) => {
      const tipo = input.getAttribute('data-file-accept') || 'imagens-pdf';
      const accept =
        tipo === 'imagens' ? ACCEPT_IMAGENS : tipo === 'pdf' ? ACCEPT_PDF : ACCEPT_IMAGENS_PDF;
      input.setAttribute('accept', accept);
      const hintId = input.getAttribute('data-file-hint');
      if (hintId) {
        const el = document.getElementById(hintId);
        const hint =
          tipo === 'imagens' ? HINT_IMAGENS : tipo === 'pdf' ? HINT_PDF : HINT_IMAGENS_PDF;
        if (el) el.textContent = 'Formatos aceites: ' + hint;
      }
    });
  }

  function renderPreviewArquivo(preview, file) {
    if (!preview || !file) return;
    if (isImagem(file)) {
      const url = URL.createObjectURL(file);
      preview.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Pré-visualização';
      preview.appendChild(img);
      return;
    }
    if (isPdf(file)) {
      preview.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'app-profile-photo__pdf';
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', 'Ficheiro PDF: ' + file.name);
      box.innerHTML = '<span aria-hidden="true">📄</span><span class="app-profile-photo__pdf-name">' + file.name + '</span>';
      preview.appendChild(box);
    }
  }

  g.GUIA_ME_arquivos = {
    ACCEPT_IMAGENS,
    ACCEPT_IMAGENS_PDF,
    ACCEPT_PDF,
    HINT_IMAGENS,
    HINT_IMAGENS_PDF,
    HINT_PDF,
    isImagem,
    isPdf,
    isAceito,
    aplicarAccepts,
    renderPreviewArquivo,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicarAccepts);
  } else {
    aplicarAccepts();
  }
})(window);
