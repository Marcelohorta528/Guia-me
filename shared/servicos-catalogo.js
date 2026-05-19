/**
 * Catálogo de serviços por categoria (protótipo + cliente + cadastro prestador).
 * Marque o contentor com data-servicos-catalogo e inclua .chips-categoria + .chips-servico.
 * Em .chips-servico use data-single="true" para um serviço ativo; omita para vários (com memória entre categorias).
 * data-servicos-permite-extra — só em modo multi: prestador inclui “outras categorias” / serviços fora do catálogo oficial.
 * data-categoria-lista — categoria em <select> (lista) em vez de chips; útil no fluxo cliente (passo 3).
 * data-servico-lista — tipo de serviço em <select> (só com seleção única, ex. data-single no bloco de serviços).
 */
(function () {
  window.GUIA_ME_SERVICOS_CATALOGO = [
    {
      id: 'casa-reforma',
      nome: 'Casa e reforma',
      servicos: [
        'Eletricista',
        'Encanador',
        'Pintor',
        'Marceneiro',
        'Pedreiro / alvenaria',
        'Gesseiro / drywall',
        'Vidraçaria',
        'Serralheiro',
      ],
    },
    {
      id: 'instalacoes',
      nome: 'Instalações e móveis',
      servicos: ['Ar-condicionado', 'Montador de móveis', 'Chaveiro'],
    },
    {
      id: 'limpeza-externo',
      nome: 'Limpeza e exterior',
      servicos: ['Limpeza / faxina', 'Dedetização'],
    },
    {
      id: 'piscinas',
      nome: 'Piscinas',
      servicos: [
        'Limpador de piscina',
        'Manutenção de piscina',
        'Tratamento de água (piscina)',
        'Instalação de bomba e filtro',
      ],
    },
    {
      id: 'jardinagem',
      nome: 'Jardinagem',
      servicos: [
        'Jardinagem e poda',
        'Paisagismo',
        'Gramado e irrigação',
        'Roçagem e limpeza de terreno',
      ],
    },
    {
      id: 'guincho',
      nome: 'Guincho e assistência veicular',
      servicos: [
        'Guincho / reboque',
        'Assistência na via',
        'Transporte de veículo',
        'Pane seca / bateria',
      ],
    },
    {
      id: 'cinema-tv-som',
      nome: 'Cinema, TV e som',
      servicos: [
        'Home theater / cinema em casa',
        'Instalação de TV e suporte',
        'Som ambiente e caixas',
        'Projetor e tela',
      ],
    },
    {
      id: 'manutencao-eletrodomesticos',
      nome: 'Manutenção e consertos — eletrodomésticos',
      servicos: [
        'Geladeira e freezer',
        'Máquina de lavar / lava e seca',
        'Ventiladores',
        'Micro-ondas e forno elétrico',
        'Eletrodomésticos em geral',
        'Conserto e manutenção preventiva',
      ],
    },
    {
      id: 'tecnologia',
      nome: 'Tecnologia',
      servicos: ['Informática / redes', 'Câmeras e alarmes', 'Automação / smart home'],
    },
    {
      id: 'enfermagem-cuidados',
      nome: 'Enfermagem e cuidados',
      servicos: [
        'Enfermeiro(a)',
        'Técnico(a) em enfermagem',
        'Cuidador(a) / acompanhante',
        'Babá / cuidadora infantil',
      ],
    },
    {
      id: 'beleza-estetica',
      nome: 'Beleza e estética',
      servicos: ['Cabeleireiro(a)', 'Barbeiro', 'Manicure / pedicure', 'Design de sobrancelhas'],
    },
    {
      id: 'mecanica-auto',
      nome: 'Mecânicos de automóveis',
      servicos: ['Mecânica geral', 'Elétrica automotiva', 'Funilaria e pintura', 'Ar condicionado veicular'],
    },
    {
      id: 'mecanica-bombas-maquinas',
      nome: 'Bombas e máquinas',
      servicos: ['Bombas e hidráulica', 'Compressores e pneumática', 'Motores e máquinas industriais', 'Manutenção de equipamentos'],
    },
    {
      id: 'fisioterapia',
      nome: 'Fisioterapeutas',
      servicos: ['Ortopedia / traumato', 'Neurologia', 'Esportivo', 'Respiratório', 'Atendimento domiciliar'],
    },
    {
      id: 'psicologia',
      nome: 'Psicólogos',
      servicos: ['Clínica / geral', 'Infantil', 'Casal e família', 'Organizacional / RH'],
    },
    {
      id: 'educacao',
      nome: 'Explicadores e professores',
      servicos: ['Reforço escolar', 'Aulas particulares', 'Preparatório ENEM / vestibular', 'Idiomas'],
    },
    {
      id: 'despachantes',
      nome: 'Despachantes',
      servicos: ['Documentação veicular', 'Licenciamento / emplacamento', 'CNH e condutor', 'Blindados / importação'],
    },
    {
      id: 'advocacia',
      nome: 'Advogados',
      servicos: [
        'Advogado(a) — orientação geral',
        'Cível / consumidor',
        'Trabalhista / previdenciário',
        'Família e sucessões',
        'Criminal / trânsito',
        'Empresarial / contratos',
        'Tributário / fiscal',
        'Imobiliário / condomínio',
      ],
    },
    {
      id: 'motorista-particular',
      nome: 'Motorista particular',
      servicos: [
        'Motorista particular / por dia',
        'Motorista executivo',
        'Transfer aeroporto e hotel',
        'Viagem com motorista (interestadual)',
      ],
    },
    {
      id: 'vans-onibus',
      nome: 'Vans e ônibus',
      servicos: [
        'Fretamento de van',
        'Van escolar / perua',
        'Ônibus fretado / excursões',
        'Eventos e translados em grupo',
      ],
    },
    {
      id: 'contabilidade',
      nome: 'Contadores',
      servicos: ['Contabilidade empresas', 'IRPF / planejamento', 'Abertura e regularização', 'Folha e departamento pessoal'],
    },
  ];

  const MAX_OUTRAS_CATEGORIAS = 24;

  function renderCategorias(el) {
    el.innerHTML = '';
    window.GUIA_ME_SERVICOS_CATALOGO.forEach((cat, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (i === 0 ? ' chip--active' : '');
      b.textContent = cat.nome;
      b.dataset.categoriaId = cat.id;
      el.appendChild(b);
    });
  }

  function initWrapper(wrapper) {
    const catEl = wrapper.querySelector('.chips-categoria');
    const servEl = wrapper.querySelector('.chips-servico');
    if (!catEl || !servEl) return;

    const catalog = window.GUIA_ME_SERVICOS_CATALOGO;
    const firstCat = catalog[0];
    const multi = servEl.getAttribute('data-single') !== 'true';
    const permiteExtra = multi && wrapper.hasAttribute('data-servicos-permite-extra');
    const categoriaLista = wrapper.hasAttribute('data-categoria-lista');
    const servicoLista = wrapper.hasAttribute('data-servico-lista') && !multi;
    let catSelect = null;
    let servSelect = null;
    const selection = new Set();
    if (multi && firstCat.servicos[0]) selection.add(firstCat.servicos[0]);

    let customRow = null;
    let extraInput = null;
    let extraBtn = null;

    if (permiteExtra) {
      const extraBlock = document.createElement('div');
      extraBlock.className = 'servicos-catalogo-extra';
      extraBlock.innerHTML =
        '<p class="cad-chips-note servicos-extra-title">Outras categorias (opcional)</p>' +
        '<p class="servicos-extra-hint">Se ainda não existir no catálogo, escreva o nome da <strong>categoria ou do serviço</strong>, toque em <strong>Adicionar</strong> e marque as chips que quiser exibir. Remove tocando de novo na chip.</p>' +
        '<div class="servicos-extra-add-row">' +
        '<input type="text" class="cad-input servicos-extra-input" maxlength="120" placeholder="Ex.: podóloga, estética automotiva, aulas de violão" aria-label="Nova categoria ou tipo de serviço">' +
        '<button type="button" class="cad-btn-secondary servicos-extra-add-btn">Adicionar</button>' +
        '</div>' +
        '<div class="chips chips-custom chips-scroll servicos-extra-chips" role="group" aria-label="Outras categorias ou serviços adicionados"></div>';
      servEl.insertAdjacentElement('afterend', extraBlock);
      customRow = extraBlock.querySelector('.chips-custom');
      extraInput = extraBlock.querySelector('.servicos-extra-input');
      extraBtn = extraBlock.querySelector('.servicos-extra-add-btn');

      function catalogHasLabel(t) {
        const x = t.toLowerCase();
        return catalog.some((c) => c.servicos.some((s) => s.toLowerCase() === x));
      }

      function domHasLabel(t) {
        const x = t.toLowerCase();
        return [...servEl.querySelectorAll('.chip')].some((c) => c.textContent.trim().toLowerCase() === x);
      }

      function customHasLabel(t) {
        const x = t.toLowerCase();
        return [...customRow.querySelectorAll('.chip')].some((c) => c.textContent.trim().toLowerCase() === x);
      }

      function addExtraLabel(raw) {
        const label = raw.replace(/\s+/g, ' ').trim();
        if (label.length < 2 || label.length > 120) return;
        if (catalogHasLabel(label) || domHasLabel(label) || customHasLabel(label)) return;
        if (customRow.querySelectorAll('.chip').length >= MAX_OUTRAS_CATEGORIAS) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip chip--active';
        b.textContent = label;
        customRow.appendChild(b);
        selection.add(label);
        if (extraInput) extraInput.value = '';
        emitChange();
      }

      extraBtn.addEventListener('click', () => addExtraLabel(extraInput?.value ?? ''));
      extraInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addExtraLabel(extraInput.value);
        }
      });

      customRow.addEventListener('click', () => {
        setTimeout(() => {
          mergeDomIntoSelection();
          emitChange();
        }, 0);
      });
    }

    function getActiveCatId() {
      if (categoriaLista && catSelect) return String(catSelect.value || firstCat.id);
      const ac = catEl.querySelector('.chip--active');
      return ac?.dataset.categoriaId || firstCat.id;
    }

    function syncDataset() {
      if (multi) {
        wrapper.dataset.guiameServicos = JSON.stringify([...selection].sort());
      } else {
        let t = '';
        if (servicoLista && servSelect?.selectedOptions?.[0]) {
          const opt = servSelect.selectedOptions[0];
          t = opt.value ? String(opt.textContent).trim() : '';
        } else {
          t = servEl.querySelector('.chip.chip--active')?.textContent.trim() ?? '';
        }
        wrapper.dataset.guiameServicos = JSON.stringify(t ? [t] : []);
      }
    }

    function renderServicos(catId) {
      const cat = catalog.find((c) => c.id === catId) || firstCat;
      servEl.innerHTML = '';
      servSelect = null;

      if (servicoLista) {
        servEl.classList.add('servicos-servico--lista');
        servSelect = document.createElement('select');
        servSelect.className = 'servicos-servico-select';
        servSelect.setAttribute('aria-label', 'Tipo de serviço');
        cat.servicos.forEach((nome) => {
          const opt = document.createElement('option');
          opt.value = nome;
          opt.textContent = nome;
          servSelect.appendChild(opt);
        });
        if (!cat.servicos.length) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = '— Nenhum serviço nesta categoria —';
          opt.disabled = true;
          opt.selected = true;
          servSelect.appendChild(opt);
        }
        servEl.appendChild(servSelect);
        servSelect.addEventListener('change', () => emitChange());
        return;
      }

      servEl.classList.remove('servicos-servico--lista');
      cat.servicos.forEach((nome, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        const isActive = multi ? selection.has(nome) : i === 0;
        b.className = 'chip' + (isActive ? ' chip--active' : '');
        b.textContent = nome;
        servEl.appendChild(b);
      });
      if (multi && !servEl.querySelector('.chip.chip--active') && cat.servicos.length) {
        const first = cat.servicos[0];
        selection.add(first);
        servEl.querySelectorAll('.chip').forEach((c) => {
          c.classList.toggle('chip--active', c.textContent.trim() === first);
        });
      }
    }

    function mergeDomIntoSelection() {
      if (!multi) return;
      const cat = catalog.find((c) => c.id === getActiveCatId()) || firstCat;
      cat.servicos.forEach((nome) => selection.delete(nome));
      servEl.querySelectorAll('.chip.chip--active').forEach((chip) => {
        const t = chip.textContent.trim();
        if (cat.servicos.includes(t)) selection.add(t);
      });
      if (customRow) {
        customRow.querySelectorAll('.chip').forEach((chip) => {
          const t = chip.textContent.trim();
          if (chip.classList.contains('chip--active')) selection.add(t);
          else selection.delete(t);
        });
      }
      if (!servEl.querySelector('.chip.chip--active') && cat.servicos.length) {
        const first = cat.servicos[0];
        selection.add(first);
        servEl.querySelectorAll('.chip').forEach((c) => {
          c.classList.toggle('chip--active', c.textContent.trim() === first);
        });
      }
    }

    function emitChange() {
      syncDataset();
      wrapper.dispatchEvent(new CustomEvent('servicocatalogochange', { bubbles: true }));
    }

    if (categoriaLista) {
      catEl.innerHTML = '';
      catEl.classList.add('servicos-categoria--lista');
      catSelect = document.createElement('select');
      catSelect.className = 'servicos-categoria-select';
      catSelect.setAttribute('aria-label', 'Categoria');
      catalog.forEach((cat) => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.nome;
        catSelect.appendChild(opt);
      });
      catEl.appendChild(catSelect);
      catSelect.addEventListener('change', () => {
        renderServicos(getActiveCatId());
        emitChange();
      });
    } else {
      renderCategorias(catEl);
    }

    renderServicos(getActiveCatId());
    emitChange();

    if (!categoriaLista) {
      catEl.addEventListener('click', (e) => {
        const chip = e.target.closest('button.chip');
        if (!chip || !catEl.contains(chip)) return;
        catEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--active'));
        chip.classList.add('chip--active');
        const id = chip.dataset.categoriaId || firstCat.id;
        renderServicos(id);
        emitChange();
      });
    }

    servEl.addEventListener('click', () => {
      setTimeout(() => {
        mergeDomIntoSelection();
        emitChange();
      }, 0);
    });
  }

  function boot() {
    document.querySelectorAll('[data-servicos-catalogo]').forEach(initWrapper);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
