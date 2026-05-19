/**
 * Wizard de cadastro (modelo tipo iFood: telefone → SMS → dados → rosto → restante).
 * data-cad-api + data-cad-submit-step → POST /api/cadastro/* (OTP + biometria + documentos validados no servidor).
 * Passo 1 → POST /api/sms/dev-send (código no terminal + JSON devCode para preencher caixas).
 */
(function () {
  const shell = document.querySelector('.cad-shell[data-cad-total]');
  if (!shell) return;

  const total = Math.max(1, Number(shell.dataset.cadTotal) || 4);
  const apiType = shell.dataset.cadApi;
  const submitStep = Number(shell.dataset.cadSubmitStep || 0);
  /** Prefixo opcional da API (vazio = URLs relativas no mesmo host). */
  const apiPrefix = (shell.dataset.cadApiBase || '').replace(/\/$/, '');

  const backBtn = document.getElementById('cad-back');
  const nextBtn = document.getElementById('cad-next');
  const fill = document.getElementById('cad-progress-fill');
  const topTitle = document.getElementById('cad-top-title');
  const footer = document.getElementById('cad-footer-actions');

  let step = 1;

  function steps() {
    return [...shell.querySelectorAll('.cad-step[data-cad-step]')];
  }

  function syncOtpHidden() {
    shell.querySelectorAll('.cad-otp-sync').forEach((root) => {
      const boxes = root.querySelectorAll('.cad-otp-box');
      const hidden = root.querySelector('input[type="hidden"]');
      if (hidden && boxes.length) hidden.value = [...boxes].map((b) => b.value).join('');
    });
  }

  function fillOtpBoxes(code) {
    const boxes = shell.querySelectorAll('.cad-otp-box');
    String(code)
      .replace(/\D/g, '')
      .slice(0, 6)
      .split('')
      .forEach((d, i) => {
        if (boxes[i]) boxes[i].value = d;
      });
    syncOtpHidden();
  }

  function collectPayload() {
    const payload = {};
    shell.querySelectorAll('.cad-step:not(.cad-step--success) input, .cad-step:not(.cad-step--success) select, .cad-step:not(.cad-step--success) textarea').forEach((el) => {
      const n = el.name;
      if (!n) return;
      if (el.type === 'checkbox') {
        payload[n] = el.checked;
        return;
      }
      if (el.type === 'button' || el.type === 'submit') return;
      payload[n] = el.value;
    });
    if (apiType === 'prestador') {
      const pSvc = shell.querySelector('[data-cad-step="5"]');
      const pArea = shell.querySelector('[data-cad-step="6"]');
      const wrap = pSvc?.querySelector('[data-servicos-catalogo]');
      let cats = [];
      if (wrap?.dataset.guiameServicos) {
        try {
          const arr = JSON.parse(wrap.dataset.guiameServicos);
          if (Array.isArray(arr)) cats = arr.map((s) => String(s).trim()).filter(Boolean);
        } catch (_) {
          /* ignore */
        }
      }
      if (!cats.length && pSvc) {
        cats = [...pSvc.querySelectorAll('.chips-servico .chip.chip--active')].map((c) => c.textContent.trim());
      }
      payload.categorias = cats;
      payload.bairros = pArea ? [...pArea.querySelectorAll('.chip.chip--active')].map((c) => c.textContent.trim()) : [];
      ['preco_hora', 'preco_diaria', 'preco_fixo'].forEach((k) => {
        const raw = payload[k];
        if (raw === '' || raw === undefined) {
          delete payload[k];
          return;
        }
        const num = Number(String(raw).replace(',', '.'));
        if (!Number.isFinite(num) || num < 0) delete payload[k];
        else payload[k] = Math.round(num * 100) / 100;
      });
    }
    return payload;
  }

  async function submitToApi() {
    const url = `${apiPrefix}/api/cadastro/${apiType}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectPayload()),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || 'Erro na API');
    return data;
  }

  async function sendDevSms(panel) {
    const tel = panel.querySelector('[name="celular"]')?.value;
    const url = `${apiPrefix}/api/sms/dev-send`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ celular: tel }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha ao pedir código SMS');
    if (data.devCode && shell.dataset.autofillOtp !== 'false') fillOtpBoxes(data.devCode);
  }

  function show(s) {
    const prevStep = step;
    step = Math.min(Math.max(1, s), total);
    syncOtpHidden();

    steps().forEach((el) => {
      const n = Number(el.dataset.cadStep);
      el.hidden = n !== step;
    });

    const panel = shell.querySelector(`.cad-step[data-cad-step="${step}"]`);
    const isSuccess = panel?.classList.contains('cad-step--success');

    if (topTitle && panel?.dataset.cadTitle) topTitle.textContent = panel.dataset.cadTitle;

    if (fill) fill.style.width = `${(step / total) * 100}%`;

    if (footer) footer.hidden = !!isSuccess;

    if (nextBtn) {
      nextBtn.style.display = isSuccess ? 'none' : 'block';
      if (!isSuccess && panel?.dataset.cadNextLabel) nextBtn.textContent = panel.dataset.cadNextLabel;
      else if (!isSuccess) nextBtn.textContent = 'Continuar';
    }

    if (backBtn) {
      if (isSuccess) {
        backBtn.disabled = false;
        backBtn.style.visibility = 'visible';
        backBtn.setAttribute('aria-label', 'Fechar e voltar ao site');
      } else {
        backBtn.disabled = step <= 1;
        backBtn.style.visibility = step <= 1 ? 'hidden' : 'visible';
        backBtn.setAttribute('aria-label', 'Voltar');
      }
    }

    shell.dispatchEvent(
      new CustomEvent('cadastrostep', {
        bubbles: true,
        detail: { step, total, prevStep, panel },
      })
    );
  }

  function go(delta) {
    show(step + delta);
  }

  backBtn?.addEventListener('click', () => {
    const panel = shell.querySelector(`.cad-step[data-cad-step="${step}"]`);
    if (panel?.classList.contains('cad-step--success')) {
      window.location.href = shell.dataset.cadExit || 'index.html';
      return;
    }
    if (step <= 1) {
      window.location.href = shell.dataset.cadExit || 'index.html';
      return;
    }
    go(-1);
  });

  nextBtn?.addEventListener('click', async () => {
    if (step >= total) return;
    syncOtpHidden();
    const panel = shell.querySelector(`.cad-step[data-cad-step="${step}"]`);
    const firstInvalid = panel?.querySelector(':invalid');
    if (firstInvalid) {
      firstInvalid.reportValidity?.();
      firstInvalid.focus?.();
      return;
    }
    const needsCheck = panel?.querySelector('input[type="checkbox"][required]');
    if (needsCheck && !needsCheck.checked) {
      needsCheck.reportValidity?.();
      return;
    }

    if (panel?.classList.contains('cad-step-face')) {
      const ok = panel.querySelector('input[name="biometriaFaceOk"]')?.value === '1';
      if (!ok) {
        const st = panel.querySelector('[data-cad-face-status]');
        if (st) st.focus?.();
        window.alert(
          'Conclua a verificação facial: ative a câmara, capture a imagem e aguarde a confirmação (ou confirme no modo manual, se aparecer).'
        );
        return;
      }
    }

    if (apiType && step === 1) {
      nextBtn.disabled = true;
      try {
        await sendDevSms(panel);
      } catch (e) {
        alert(
          `${e?.message || e}\n\nUse: .\\iniciar-com-api.ps1 e abra http://localhost:3333/cadastro-${apiType}.html`
        );
        nextBtn.disabled = false;
        return;
      }
      nextBtn.disabled = false;
    }

    if (apiType && submitStep > 0 && step === submitStep) {
      nextBtn.disabled = true;
      try {
        await submitToApi();
      } catch (e) {
        alert(
          `${e?.message || e}\n\nConfira: código SMS, senha (mín. 6), verificação facial, documento (cliente) ou CNPJ válido de 14 dígitos (prestador).`
        );
        nextBtn.disabled = false;
        return;
      }
      nextBtn.disabled = false;
    }

    go(1);
  });

  document.querySelectorAll('.cad-otp-sync').forEach((root) => {
    const boxes = [...root.querySelectorAll('.cad-otp-box')];
    boxes.forEach((box, i) => {
      box.addEventListener('input', () => {
        box.value = box.value.replace(/\D/g, '').slice(-1);
        if (box.value && boxes[i + 1]) boxes[i + 1].focus();
        syncOtpHidden();
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && boxes[i - 1]) boxes[i - 1].focus();
      });
    });
  });

  document.getElementById('cad-resend')?.addEventListener('click', async () => {
    const p1 = shell.querySelector('[data-cad-step="1"]');
    if (apiType && p1) {
      try {
        await sendDevSms(p1);
        alert('Novo código gerado (ver terminal ou caixas se preenchimento automático estiver ativo).');
      } catch {
        alert('Simulação: em produção reenviaria SMS pela API.');
      }
      return;
    }
    alert('Simulação: novo código “enviado”.');
  });

  show(1);
})();
