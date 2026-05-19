/**
 * Mapa OpenStreetMap (Leaflet) + botão GPS.
 * Estabelecimentos próximos: ícones só visuais (estilo carros Uber), sem endereço no mapa.
 */
(function (g) {
  const BOUNDS_BRASIL = () =>
    typeof L !== 'undefined'
      ? L.latLngBounds(L.latLng(-33.75, -73.99), L.latLng(5.27, -34.76))
      : null;

  /** Pins de demo no Rio — só visual, sem popup de endereço. */
  const PINS_RIO_EXEMPLO = [
    { latlng: [-22.9711, -43.1822], tipo: 'estabelecimento', visualOnly: true, rotacao: 18 },
    { latlng: [-22.9685, -43.189], tipo: 'estabelecimento', visualOnly: true, rotacao: -32 },
    { latlng: [-22.9182, -43.1754], tipo: 'estabelecimento', visualOnly: true, rotacao: 55 },
    { latlng: [-22.921, -43.168], tipo: 'estabelecimento', visualOnly: true, rotacao: 120 },
    { latlng: [-22.9068, -43.1729], tipo: 'estabelecimento', visualOnly: true, rotacao: -15 },
    { latlng: [-22.9095, -43.181], tipo: 'estabelecimento', visualOnly: true, rotacao: 70 },
  ];

  function syncZone(cidadeId, bairroId, zoneId, zonePrefix) {
    const cidade = document.getElementById(cidadeId)?.value?.split('—')[0]?.trim() ?? '';
    const bairro = document.getElementById(bairroId)?.value ?? '';
    const zone = document.getElementById(zoneId);
    const prefix = zonePrefix || 'Região';
    if (zone && bairro) zone.textContent = `${prefix}: ${bairro}${cidade ? ` (${cidade})` : ''}`;
  }

  function createEstabelecimentoIcon(rotacao) {
    const rot = rotacao != null ? Number(rotacao) : Math.floor(Math.random() * 360);
    return L.divIcon({
      className: 'map-marker-estabelecimento-wrap',
      html:
        '<span class="map-marker-estabelecimento" style="--map-pin-rot:' +
        rot +
        'deg" role="img" aria-label="Prestador próximo"></span>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  function createUserIcon() {
    return L.divIcon({
      className: 'map-marker-user-wrap',
      html: '<span class="map-marker-user" role="img" aria-label="Sua localização"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  function addPinToMap(map, pin, layerGroup) {
    const tipo = pin.tipo || 'estabelecimento';
    const visualOnly = pin.visualOnly !== false && tipo === 'estabelecimento';

    let marker;
    if (tipo === 'estabelecimento') {
      marker = L.marker(pin.latlng, {
        icon: createEstabelecimentoIcon(pin.rotacao),
        interactive: !visualOnly,
        keyboard: false,
      });
    } else if (tipo === 'usuario') {
      marker = L.marker(pin.latlng, { icon: createUserIcon(), zIndexOffset: 1000 });
    } else {
      marker = L.marker(pin.latlng);
    }

    if (!visualOnly && pin.t) {
      marker.bindPopup(pin.t);
    }

    if (layerGroup) marker.addTo(layerGroup);
    else marker.addTo(map);
    return marker;
  }

  /** Gera posições aleatórias em torno do usuário (~500 m–2 km). */
  function gerarEstabelecimentosProximos(lat, lng, quantidade) {
    const n = quantidade ?? 7;
    const out = [];
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.004 + Math.random() * 0.014;
      out.push({
        latlng: [lat + Math.cos(angle) * dist, lng + Math.sin(angle) * dist * 1.15],
        tipo: 'estabelecimento',
        visualOnly: true,
        rotacao: Math.floor(Math.random() * 360),
      });
    }
    return out;
  }

  /**
   * @param {object} opts
   * @param {string} opts.mapId
   * @param {string} opts.gpsBtnId
   * @param {string} [opts.zoneId]
   * @param {string} [opts.cidadeId]
   * @param {string} [opts.bairroId]
   * @param {Array<object>} [opts.pins]
   * @param {boolean} [opts.establishmentsNearUser] gerar ícones ao usar GPS
   * @param {number} [opts.establishmentsCount]
   * @param {string} [opts.userPopup]
   * @param {boolean} [opts.fitBrasil]
   */
  function init(opts) {
    if (typeof L === 'undefined') return null;
    const el = document.getElementById(opts.mapId);
    if (!el) return null;

    const bounds = BOUNDS_BRASIL();
    if (!bounds) return null;

    const map = L.map(el, {
      scrollWheelZoom: false,
      minZoom: 3,
      maxBounds: bounds.pad(0.08),
      maxBoundsViscosity: 0.85,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    map.fitBounds(bounds, { padding: [12, 12], maxZoom: 5 });

    const estabelecimentosLayer = L.layerGroup().addTo(map);
    const pins = opts.pins ?? PINS_RIO_EXEMPLO;
    pins.forEach((p) => addPinToMap(map, p, estabelecimentosLayer));

    let userMarker = null;
    const popupText = opts.userPopup || 'Sua posição';

    function mostrarEstabelecimentosProximos(lat, lng) {
      estabelecimentosLayer.clearLayers();
      gerarEstabelecimentosProximos(lat, lng, opts.establishmentsCount ?? 8).forEach((p) =>
        addPinToMap(map, p, estabelecimentosLayer)
      );
    }

    function centerOnUser() {
      const btn = document.getElementById(opts.gpsBtnId);
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
          if (userMarker) {
            try {
              map.removeLayer(userMarker);
            } catch {
              /* ignore */
            }
          }
          userMarker = L.marker([la, lo], { icon: createUserIcon(), zIndexOffset: 2000 }).addTo(map);
          if (opts.establishmentsNearUser !== false) {
            mostrarEstabelecimentosProximos(la, lo);
          }
          map.invalidateSize();
          if (btn) btn.disabled = false;
        },
        () => {
          if (btn) btn.disabled = false;
          window.alert(
            'Não foi possível obter a localização. Verifique permissões do navegador ou use localhost / HTTPS.'
          );
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    }

    document.getElementById(opts.gpsBtnId)?.addEventListener('click', centerOnUser);

    if (opts.zoneId && opts.cidadeId && opts.bairroId) {
      const sync = () => syncZone(opts.cidadeId, opts.bairroId, opts.zoneId, opts.zonePrefix);
      document.getElementById(opts.cidadeId)?.addEventListener('change', sync);
      document.getElementById(opts.bairroId)?.addEventListener('change', sync);
      sync();
    }

    setTimeout(() => {
      map.invalidateSize();
      if (opts.fitBrasil !== false) map.fitBounds(bounds, { padding: [12, 12], maxZoom: 5 });
    }, 400);

    return { map, centerOnUser, mostrarEstabelecimentosProximos, estabelecimentosLayer };
  }

  g.GUIA_ME_mapaLocalizacao = {
    init,
    syncZone,
    PINS_RIO_EXEMPLO,
    gerarEstabelecimentosProximos,
  };
})(window);
