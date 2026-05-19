(function () {
  const viewCliente = document.getElementById('view-cliente');
  const viewPrestador = document.getElementById('view-prestador');
  const roleBtns = document.querySelectorAll('.proto-role-btn');
  const steps = () => Array.from(document.querySelectorAll('.proto-step'));
  const dots = () => Array.from(document.querySelectorAll('.proto-dot'));
  const progress = document.querySelector('.proto-progress');
  const resultContext = document.getElementById('proto-result-context');
  const cidadeEl = document.getElementById('proto-cidade');
  const bairroEl = document.getElementById('proto-bairro');

  let currentStep = 1;
  let protoMapDone = false;
  let protoLeafletMap = null;
  let protoUserMarker = null;

  function getActiveServiceLabel() {
    const view = document.getElementById('view-cliente');
    if (!view || !view.classList.contains('proto-view--active')) return 'Serviço';
    const srv = view.querySelector('.chips-servico .chip--active');
    const cat = view.querySelector('.chips-categoria .chip--active');
    const s = srv?.textContent.trim() || 'Serviço';
    const c = cat?.textContent.trim();
    return c ? `${s} · ${c}` : s;
  }

  function updateResultContext() {
    if (!resultContext || !bairroEl || !cidadeEl) return;
    const cidade = cidadeEl.value.split('—')[0].trim();
    const bairro = bairroEl.value;
    resultContext.textContent = `${getActiveServiceLabel()} · ${bairro} (${cidade})`;
    const zone = document.getElementById('proto-map-zone');
    if (zone) zone.textContent = `Região: ${bairro} (${cidade})`;
  }

  function destroyProtoMap() {
    if (protoLeafletMap && protoUserMarker) {
      try {
        protoLeafletMap.removeLayer(protoUserMarker);
      } catch {
        /* ignore */
      }
      protoUserMarker = null;
    }
    if (protoLeafletMap) {
      try {
        protoLeafletMap.remove();
      } catch {
        /* ignore */
      }
      protoLeafletMap = null;
    }
    protoMapDone = false;
    const mapEl = document.getElementById('mapa-proto-osm');
    if (mapEl) {
      const fresh = document.createElement('div');
      fresh.id = 'mapa-proto-osm';
      fresh.className = 'map-osm proto-map-osm';
      fresh.setAttribute('aria-label', 'Mapa OpenStreetMap');
      mapEl.replaceWith(fresh);
    }
  }

  function ensureProtoMap() {
    if (protoMapDone || typeof L === 'undefined') return;
    const el = document.getElementById('mapa-proto-osm');
    if (!el) return;
    /** Extensão continental do Brasil (OSM); pins de demo ficam no Rio de Janeiro. */
    const boundsBrasil = L.latLngBounds(
      L.latLng(-33.75, -73.99),
      L.latLng(5.27, -34.76)
    );
    const map = L.map(el, { scrollWheelZoom: false, minZoom: 3, maxBounds: boundsBrasil.pad(0.08), maxBoundsViscosity: 0.85 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OSM',
    }).addTo(map);
    map.fitBounds(boundsBrasil, { padding: [10, 10], maxZoom: 5 });
    [
      [-22.9711, -43.1822, '1 · Paulo Luz — Copacabana (RJ)'],
      [-22.9182, -43.1754, '2 · Elétrica Souza — Tijuca (RJ)'],
      [-22.9068, -43.1729, '3 · Instalações JR — Centro (RJ)'],
    ].forEach(([la, lo, t]) => L.marker([la, lo]).addTo(map).bindPopup(t));
    setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(boundsBrasil, { padding: [10, 10], maxZoom: 5 });
    }, 350);
    protoLeafletMap = map;
    protoMapDone = true;
  }

  function centerProtoMapOnUser() {
    const map = protoLeafletMap;
    const btn = document.getElementById('proto-gps-btn');
    if (!map) return;
    if (!navigator.geolocation) {
      window.alert('Geolocalização não está disponível neste navegador.');
      return;
    }
    if (btn) btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude;
        const lo = pos.coords.longitude;
        map.setView([la, lo], Math.max(map.getZoom(), 15));
        if (protoUserMarker) {
          try {
            map.removeLayer(protoUserMarker);
          } catch {
            /* ignore */
          }
        }
        protoUserMarker = L.marker([la, lo]).addTo(map).bindPopup('Sua posição (aproximada pelo dispositivo)');
        map.invalidateSize();
        setTimeout(() => {
          try {
            protoUserMarker.openPopup();
          } catch {
            /* ignore */
          }
        }, 80);
        if (btn) btn.disabled = false;
      },
      () => {
        if (btn) btn.disabled = false;
        window.alert('Não foi possível obter a localização. Verifique permissões do navegador ou tente em HTTPS / localhost.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  function refreshProtoDescricaoHistorico() {
    const hist = window.GUIA_ME_pedidoDescricaoHistorico;
    const ta = document.getElementById('proto-pedido-descricao');
    const wrap = document.getElementById('proto-pedido-desc-historico-wrap');
    const list = document.getElementById('proto-pedido-desc-historico-list');
    if (hist && ta && wrap && list) hist.render(wrap, list, ta);
  }

  const protoAnexos = window.GUIA_ME_pedidoAnexos?.bindFotosPreview('proto-pedido-fotos', 'proto-pedido-fotos-preview');

  function setStep(n) {
    currentStep = n;
    steps().forEach((el) => {
      const s = Number(el.dataset.step);
      const active = s === n;
      el.hidden = !active;
    });
    dots().forEach((d) => {
      const s = Number(d.dataset.stepDot);
      d.classList.toggle('proto-dot--active', s === n && n >= 1 && n <= 4);
    });
    if (progress) progress.style.display = n === 5 ? 'none' : '';
    if (n === 3) {
      updateResultContext();
      setTimeout(ensureProtoMap, 60);
    }
    if (n === 4) {
      refreshProtoDescricaoHistorico();
    }
  }

  function setRole(role) {
    const isCliente = role === 'cliente';
    viewCliente.hidden = !isCliente;
    viewPrestador.hidden = isCliente;
    viewCliente.classList.toggle('proto-view--active', isCliente);
    viewPrestador.classList.toggle('proto-view--active', !isCliente);
    roleBtns.forEach((btn) => {
      const active = btn.dataset.role === role;
      btn.classList.toggle('proto-role-btn--active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  document.querySelector('#view-cliente')?.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;

    if (t.id === 'proto-gps-btn' || t.closest('#proto-gps-btn')) {
      centerProtoMapOnUser();
      return;
    }

    if (t.dataset.action === 'next') {
      if (currentStep < 5) setStep(currentStep + 1);
    }
    if (t.dataset.action === 'prev' && currentStep > 1) {
      setStep(currentStep - 1);
    }
    if (t.dataset.action === 'restart') {
      destroyProtoMap();
      document.querySelector('#proto-form-pedido')?.reset();
      protoAnexos?.clear();
      refreshProtoDescricaoHistorico();
      setStep(1);
    }
  });

  document.getElementById('proto-submit')?.addEventListener('click', () => {
    const form = document.getElementById('proto-form-pedido');
    const ta = document.getElementById('proto-pedido-descricao') || form?.querySelector('textarea');
    if (ta && !ta.value.trim()) {
      ta.focus();
      return;
    }
    if (form && typeof form.checkValidity === 'function' && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const texto = ta?.value?.trim() ?? '';
    const hist = window.GUIA_ME_pedidoDescricaoHistorico;
    if (texto.length >= 3) hist?.save(texto);
    setStep(5);
    protoAnexos?.clear();
    const pm = document.getElementById('proto-pedido-metragem');
    if (pm) pm.value = '';
    refreshProtoDescricaoHistorico();
  });

  roleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      if (role) setRole(role);
    });
  });

  cidadeEl?.addEventListener('change', updateResultContext);
  bairroEl?.addEventListener('change', updateResultContext);

  const catWrap = document.getElementById('proto-servicos-catalogo-wrap');
  catWrap?.addEventListener('servicocatalogochange', updateResultContext);
  catWrap?.addEventListener('click', (e) => {
    if (e.target.closest('.chips-categoria, .chips-servico')) setTimeout(updateResultContext, 0);
  });

  setStep(1);
  setRole('cliente');
})();
