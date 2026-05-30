/**
 * Mapa de exemplo no portal: cliente, prestador e km entre as partes.
 */
(function () {
  const KM_IDA = 12;
  const TAXA_KM = 1.5;
  const TAXA_PLATAFORMA = 9.9;
  const cliente = [-22.9711, -43.1822];
  const prestador = [-22.9545, -43.172];

  let mapInstance = null;

  function userIcon() {
    return L.divIcon({
      className: 'map-marker-user-wrap',
      html: '<span class="map-marker-user" role="img" aria-hidden="true"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  function prestadorIcon() {
    return L.divIcon({
      className: 'map-marker-estabelecimento-wrap',
      html: '<span class="map-marker-estabelecimento" style="--map-pin-rot:12deg" role="img" aria-hidden="true"></span>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  function partyLabel(text, tipo) {
    return L.divIcon({
      className: 'portal-map-party-label-wrap',
      html: `<span class="portal-map-party-label portal-map-party-label--${tipo}">${text}</span>`,
      iconSize: [72, 20],
      iconAnchor: [36, -4],
    });
  }

  function refreshMapSize() {
    if (mapInstance) mapInstance.invalidateSize();
  }

  function hasVisibleSize(el) {
    return el.offsetWidth > 40 && el.offsetHeight > 40;
  }

  function init(retry = 0) {
    const el = document.getElementById('portal-mapa-demo');
    if (!el || typeof L === 'undefined') return;
    if (mapInstance) {
      refreshMapSize();
      return;
    }
    if (!hasVisibleSize(el)) {
      if (retry < 40) setTimeout(() => init(retry + 1), 100);
      return;
    }

    const map = L.map(el, {
      zoomControl: true,
      scrollWheelZoom: false,
      dragging: true,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    mapInstance = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);

    L.marker(cliente, { icon: userIcon(), interactive: false }).addTo(map);
    L.marker(prestador, { icon: prestadorIcon(), interactive: false }).addTo(map);
    L.marker(cliente, { icon: partyLabel('Cliente', 'cliente'), interactive: false, zIndexOffset: 500 }).addTo(map);
    L.marker(prestador, { icon: partyLabel('Prestador', 'prestador'), interactive: false, zIndexOffset: 500 }).addTo(map);

    L.polyline([cliente, prestador], {
      color: '#e8c547',
      weight: 4,
      opacity: 0.9,
      dashArray: '10 8',
      lineCap: 'round',
    }).addTo(map);

    const mid = [(cliente[0] + prestador[0]) / 2, (cliente[1] + prestador[1]) / 2];
    const kmFaturados = KM_IDA * 2;
    const taxa = kmFaturados * TAXA_KM;
    const totalCliente = Math.round(taxa * 100) / 100;

    L.marker(mid, {
      icon: L.divIcon({
        className: 'portal-map-km-badge-wrap',
        html: `<span class="portal-map-km-badge">${KM_IDA} km ida</span>`,
        iconSize: [88, 30],
        iconAnchor: [44, 15],
      }),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(map);

    map.fitBounds(L.latLngBounds([cliente, prestador]).pad(0.45));

    const stats = document.getElementById('portal-mapa-stats');
    if (stats) {
      stats.innerHTML = `
        <li><span class="hero-map-demo__stat-label">Km só ida</span><strong>${KM_IDA} km</strong></li>
        <li><span class="hero-map-demo__stat-label">Ida + volta</span><strong>${kmFaturados} km</strong></li>
        <li><span class="hero-map-demo__stat-label">Deslocamento</span><strong>R$ ${taxa.toFixed(2).replace('.', ',')}</strong></li>
        <li><span class="hero-map-demo__stat-label">Diária combinada</span><strong>a combinar</strong></li>
        <li><span class="hero-map-demo__stat-label">Cliente paga</span><strong>desloc. + diária</strong></li>
        <li><span class="hero-map-demo__stat-label">Prestador → plataforma</span><strong>R$ ${TAXA_PLATAFORMA.toFixed(2).replace('.', ',')}</strong></li>
        <li><span class="hero-map-demo__stat-label">Mín. cliente*</span><strong>R$ ${totalCliente.toFixed(2).replace('.', ',')}</strong></li>
      `;
    }

    requestAnimationFrame(refreshMapSize);
    setTimeout(refreshMapSize, 150);
    setTimeout(refreshMapSize, 500);
    setTimeout(refreshMapSize, 1200);
    window.addEventListener('resize', refreshMapSize);
    window.addEventListener('load', refreshMapSize);

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => refreshMapSize());
      ro.observe(el);
      const wrap = el.closest('.hero-map-demo__map-wrap');
      if (wrap) ro.observe(wrap);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(refreshMapSize).catch(() => {});
    }
  }

  function boot() {
    if (typeof L === 'undefined') {
      setTimeout(boot, 100);
      return;
    }
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
