/**
 * Pré-visualização de foto de perfil / logomarca (inputs com data-profile-photo-preview).
 * Respeita data-file-accept em imagens | imagens-pdf (ver arquivos-aceitos.js).
 */
(function () {
  const arq = () => window.GUIA_ME_arquivos;

  document.querySelectorAll('[data-profile-photo-input]').forEach((input) => {
    const previewId = input.getAttribute('data-profile-photo-preview');
    const preview = previewId ? document.getElementById(previewId) : null;
    if (!preview) return;

    const tipo = input.getAttribute('data-file-accept') || 'imagens';
    const placeholder = preview.querySelector('.app-profile-photo__placeholder')?.outerHTML
      || '<span class="app-profile-photo__placeholder" aria-hidden="true">📷</span>';

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      const ok = arq() && arq().isAceito(tipo, file);
      if (!file || !ok) {
        preview.innerHTML = placeholder;
        return;
      }
      if (arq().renderPreviewArquivo) {
        arq().renderPreviewArquivo(preview, file);
      }
    });
  });
})();
