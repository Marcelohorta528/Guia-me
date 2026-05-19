/**
 * Passo de verificação facial no cadastro (cliente e prestador) e em renovação periódica.
 * — Câmara + captura; deteção com FaceDetector (Chrome/Edge) quando existir.
 * — Sem envio da imagem ao servidor: só biometriaFaceOk / biometriaFaceMetodo no JSON.
 * — Navegadores sem FaceDetector: confirmação manual (demonstração; não é prova legal).
 * — A API regista biometria_face_at e exige reverificação mensal (30 dias); produção: integrar fornecedor KYC em `server/kyc.mjs` (guia: `KYC-INTEGRACAO.md`).
 */
(function () {
  let mediaStream = null;
  let faceDetectorPromise = null;

  function getFaceDetector() {
    if (!('FaceDetector' in window)) return Promise.resolve(null);
    if (!faceDetectorPromise) {
      faceDetectorPromise = Promise.resolve().then(() => {
        try {
          return new FaceDetector({ fastMode: true, maxDetectedFaces: 2 });
        } catch {
          return null;
        }
      });
    }
    return faceDetectorPromise;
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    document.querySelectorAll('.cad-step-face video').forEach((v) => {
      v.srcObject = null;
    });
  }

  function resetFacePanel(panel) {
    const ok = panel.querySelector('input[name="biometriaFaceOk"]');
    const metodo = panel.querySelector('input[name="biometriaFaceMetodo"]');
    if (ok) ok.value = '';
    if (metodo) metodo.value = '';
    const status = panel.querySelector('[data-cad-face-status]');
    if (status) {
      status.textContent = '';
    }
    const fb = panel.querySelector('[data-cad-face-fallback]');
    if (fb) fb.hidden = true;
    const fbCheck = panel.querySelector('input[name="biometriaFaceConsentFallback"]');
    if (fbCheck) {
      fbCheck.checked = false;
      fbCheck.required = false;
    }
    const cap = panel.querySelector('[data-cad-face-capture]');
    if (cap) cap.disabled = true;
    const video = panel.querySelector('video');
    if (video) {
      video.classList.remove('cad-face-video--hidden');
    }
    stopCamera();
  }

  async function startCamera(panel) {
    const video = panel.querySelector('video');
    const status = panel.querySelector('[data-cad-face-status]');
    if (!video) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      if (status) status.textContent = 'Câmara indisponível neste contexto. Use HTTPS ou localhost.';
      return;
    }
    stopCamera();
    if (status) status.textContent = 'A pedir acesso à câmara…';
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = mediaStream;
      await video.play().catch(() => {});
      const cap = panel.querySelector('[data-cad-face-capture]');
      if (cap) cap.disabled = false;
      if (status) status.textContent = 'Enquadre o rosto e toque em Capturar e analisar.';
    } catch {
      if (status) status.textContent = 'Permissão negada ou câmara em uso. Verifique as definições do navegador.';
    }
  }

  async function analyzeCapture(panel) {
    const video = panel.querySelector('video');
    const canvas = panel.querySelector('canvas');
    const status = panel.querySelector('[data-cad-face-status]');
    const okInput = panel.querySelector('input[name="biometriaFaceOk"]');
    const metodoInput = panel.querySelector('input[name="biometriaFaceMetodo"]');
    if (!video || !canvas || !okInput || !metodoInput) return;
    if (!video.videoWidth) {
      if (status) status.textContent = 'Ative primeiro a câmara.';
      return;
    }

    const w = Math.min(video.videoWidth, 640);
    const h = Math.round((w / video.videoWidth) * video.videoHeight);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    if (status) status.textContent = 'A analisar…';

    const detector = await getFaceDetector();
    if (detector) {
      try {
        const faces = await detector.detect(canvas);
        if (faces && faces.length >= 1) {
          okInput.value = '1';
          metodoInput.value = 'FaceDetector-API';
          if (status) status.textContent = 'Rosto detetado no dispositivo. Pode continuar.';
          stopCamera();
          video.classList.add('cad-face-video--hidden');
          const fb = panel.querySelector('[data-cad-face-fallback]');
          if (fb) fb.hidden = true;
          const ck = panel.querySelector('input[name="biometriaFaceConsentFallback"]');
          if (ck) ck.required = false;
          return;
        }
      } catch {
        /* continuar para modo manual */
      }
    }

    const fb = panel.querySelector('[data-cad-face-fallback]');
    if (fb) {
      fb.hidden = false;
      const ck = fb.querySelector('input[name="biometriaFaceConsentFallback"]');
      if (ck) ck.required = true;
    }
    if (status) {
      const temAuto = !!detector && 'FaceDetector' in window;
      status.textContent = temAuto
        ? 'Não detetámos um rosto claro. Melhore a luz ou enquadramento, ou confirme manualmente (demonstração).'
        : 'Este navegador não expõe deteção automática de rosto. Confirme manualmente abaixo (demonstração).';
    }
  }

  function confirmManual(panel) {
    const check = panel.querySelector('input[name="biometriaFaceConsentFallback"]');
    const okInput = panel.querySelector('input[name="biometriaFaceOk"]');
    const metodoInput = panel.querySelector('input[name="biometriaFaceMetodo"]');
    const status = panel.querySelector('[data-cad-face-status]');
    if (!check?.checked) {
      check?.reportValidity?.();
      return;
    }
    if (okInput) okInput.value = '1';
    if (metodoInput) metodoInput.value = 'manual-navegador';
    if (status) status.textContent = 'Registo de confirmação guardado só neste passo (demo). Pode continuar.';
  }

  function wire(panel) {
    if (panel.dataset.cadFaceWired === '1') return;
    panel.dataset.cadFaceWired = '1';
    panel.querySelector('[data-cad-face-start]')?.addEventListener('click', () => {
      startCamera(panel);
    });
    panel.querySelector('[data-cad-face-capture]')?.addEventListener('click', () => {
      analyzeCapture(panel);
    });
    panel.querySelector('[data-cad-face-manual-ok]')?.addEventListener('click', () => {
      confirmManual(panel);
    });
  }

  document.addEventListener('cadastrostep', (e) => {
    const shell = e.target;
    if (!shell || !shell.classList?.contains('cad-shell')) return;
    const panel = shell.querySelector('.cad-step-face');
    if (!panel) return;
    wire(panel);

    const { step, prevStep } = e.detail || {};
    const faceNum = Number(panel.dataset.cadStep);
    if (Number.isNaN(faceNum)) return;

    if (step === faceNum && prevStep !== faceNum) {
      resetFacePanel(panel);
    }
    if (step !== faceNum) {
      stopCamera();
    }
  });

  window.addEventListener('beforeunload', () => {
    stopCamera();
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-cad-face-standalone] .cad-step-face').forEach((panel) => {
      wire(panel);
    });
  });
})();
