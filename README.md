# Guia-me Service (MVP)

Protótipo web com o mesmo **objetivo de produto** que iFood e Uber: o cliente encontra **rápido e perto** o que precisa — só que aqui o “cardápio” é **serviços diversos** (começando por exemplos como **eletricista**), filtrados por **cidade e bairro**. Prestadores cadastram **onde atendem** e **o que fazem** para aparecer na busca certa.

## Stack (atual)

| Camada | Tecnologia |
|--------|------------|
| **Front** | HTML, CSS, JavaScript (sem build). **Dois apps web:** `apps/cliente/` e `apps/prestador/` + `shared/` (CSS/JS). Portal em `/`. **Leaflet** no app cliente. |
| **Servidor** | **Node.js 18+**, módulos ES (`import`), **sem dependências npm**. |
| **API** | `server/index.mjs` — estáticos + rotas JSON na porta **3333** (ou `PORT`). |
| **Dados** | `server/store.mjs` — **`server/data/store.json`**: contas (**scrypt**), OTP dev, sessões, array **`reviews`**, **`orderMessages`** (chat por pedido). **Pedidos**: por omissão em `store.orders` no mesmo JSON; com **`USE_SQLITE=1`** (e Node **22.5+**), ficheiro SQLite gratuito **`server/data/guiame.db`** (`server/sqlite-orders.mjs`, módulo nativo `node:sqlite`). |
| **Auth** | `POST /api/auth/login`, `POST /api/auth/google`, `GET /api/auth/google-config`, `GET /api/auth/me` (header `Authorization: Bearer <token>`). Login em `/cliente/login.html` e `/prestador/login.html` (celular/senha ou **Continuar com Google** se `GOOGLE_CLIENT_ID` estiver no `.env`). Reverificação facial: `POST /api/auth/biometria-renovar`, páginas `renovar-biometria.html` em cada app. Configuração OAuth: `DEPLOY-HOSPEDAGEM.md`. |
| **KYC (futuro)** | `server/kyc.mjs` + **`KYC-INTEGRACAO.md`**. Webhook stub: `POST /api/kyc/webhook`. Variáveis: `server/.env.example` (secção KYC). |
| **SMS (dev)** | `POST /api/sms/dev-send` — gera código de 6 dígitos, regista no store, imprime no **terminal**; opcional **Twilio** se `TWILIO_*` estiver definido (`server/sms.mjs`). |

## API local

Na pasta `app-servico`:

```powershell
.\iniciar-com-api.ps1
# ou: .\iniciar-com-api.cmd   (Prompt de Comandos; procura node no PATH e em Program Files)
# ou: npm start   (atalho para node server/index.mjs)
```

O `iniciar-com-api.ps1` tenta o `node` do PATH e, em Windows, caminhos típicos (`Program Files\nodejs`, NVM_SYMLINK).

Abra **http://localhost:3333/** (portal) → **http://localhost:3333/cliente/** ou **/prestador/**. Cadastros e login **não** funcionam em `file://` por causa do `fetch` na mesma origem. URLs antigas (`cliente.html`, etc.) redirecionam para os novos caminhos.

## Hospedar grátis (partilhar com terceiros)

Para um link **HTTPS** público (demo no telemóvel, clientes, investidores), siga **[DEPLOY-HOSPEDAGEM.md](DEPLOY-HOSPEDAGEM.md)** — deploy no **[Render](https://render.com)** (plano free) com o ficheiro `render.yaml` já incluído. Comando de arranque: `npm start`; health check: `GET /api/health`.

| Método | Rota | Função |
|--------|------|--------|
| GET | `/api/health` | Estado do serviço + `pedidos.backend`: `json` ou `sqlite` |
| POST | `/api/sms/dev-send` | Corpo `{ "celular": "..." }` → OTP dev |
| POST | `/api/cadastro/cliente` \| `/prestador` | Corpo JSON do wizard (inclui `otp`, `password`, …) |
| POST | `/api/pedidos` | Bearer (cliente) + JSON `{ descricao, cidade, bairro, servicos[], horario_pref?, metragem_m2?, fotos_count?, km_deslocamento?, valor_servico? }` — `km_deslocamento` = **km só ida**; `taxa_deslocamento_reais` = **ida e volta** × **R$ 2,00/km** (máx. 150 km na ida); se `valor_servico` ≥ 100, `comissao_app_reais` (15%) e `valor_liquido_prestador_servico`; grava em **`store.orders`** ou **SQLite** |
| GET | `/api/pedidos` | Bearer → **cliente:** `pedidos` = os seus; **prestador:** `pedidos` = **fila de espera** (`novo`, sem prestador, match área/serviços) e **`meus_pedidos`** = em negociação/concluídos (`aceito` ou `concluido`). Cada pedido inclui `em_fila_espera`, `status_label`, `status_descricao`. |
| POST | `/api/pedidos/<uuid>/aceitar` | Bearer (prestador) — **aceite inicial de negociação**; atribui o pedido a si; `status` → `aceito` (sai da fila) |
| POST | `/api/pedidos/<uuid>/orcamento` | Bearer (prestador atribuído) — envia ou **atualiza** proposta: JSON `{ "valor": number, "observacao?": string }` (valor ≥ **100**); grava `orcamentoValor`, comissão 15% e líquido; só com pedido **`aceito`** |
| POST | `/api/pedidos/<uuid>/fechamento-cliente` | Bearer (cliente dono) — confirma **fechamento do orçamento** / acordo; com confirmação do prestador → `concluido` |
| POST | `/api/pedidos/<uuid>/fechamento-prestador` | Bearer (prestador atribuído) — idem (**fechamento do orçamento**); ambas as partes → `concluido` |
| GET | `/api/pedidos/<uuid>/messages` | Bearer — **cliente** (dono) ou **prestador** (atribuído ao pedido ou em fila `novo` com match de área/serviços) → `{ mensagens: [{ id, body, createdAt, authorTipo, authorLabel }] }` |
| POST | `/api/pedidos/<uuid>/messages` | Bearer + JSON `{ "body": "..." }` (ou `texto`) — grava mensagem em **`store.json` → `orderMessages`** |
| POST | `/api/auth/login` | `{ "celular", "password" }` → `{ token, tipo, accountId }` |
| GET | `/api/auth/google-config` | `{ enabled, clientId }` — ID público para o botão GIS |
| POST | `/api/auth/google` | `{ "tipo": "cliente"\|"prestador", "credential": "<id_token>" }` → `{ token, ... }` |
| GET | `/api/auth/me` | Bearer token → dados da conta + estado `biometriaFacial` |
| POST | `/api/auth/biometria-renovar` | Bearer + `{ "biometriaFaceOk": "1", "biometriaFaceMetodo" }` — reverificação mensal |
| POST | `/api/kyc/webhook` | **Stub** para o fornecedor KYC (ver `KYC-INTEGRACAO.md`) |
| POST | `/api/avaliacoes` | Bearer + `{ "targetAccountId", "rating": 1–5, "comment" }` — cliente→prestador ou prestador→cliente |
| GET | `/api/avaliacoes?target=<uuid>` | Lista pública de avaliações recebidas por essa conta + `stats` (média, contagem) |
| GET | `/api/avaliacoes/recebidas` | Bearer → avaliações **da sua** conta + `stats` |

Variável `SKIP_OTP=1` (ver `.env.example`) desativa a verificação do código no servidor — **nunca em produção**.

Para **só HTML estático** (sem gravar conta): `.\servidor-local.ps1` (Python).

## Como ver localmente

- Ficheiros: abra `index.html`, ou
- Python: `.\servidor-local.ps1` (porta 5510).
- **API + pedidos (Node):** na pasta `app-servico`, `npm start` → `http://localhost:3333/` — roteiro passo a passo: **`TESTE-FLUXO-PEDIDO-API.md`**.

## Escopo do MVP (fase 1)

1. Hub na home (proposta, MVP, roadmap).
2. Cliente em páginas: local → serviços → **mapa OSM** + lista mock → pedido mock.
3. Prestador em páginas: área, serviços, fila mock.
4. **Cadastro** cliente/prestador (fluxo iFood) + **senha** + **OTP dev** + gravação em `store.json` via API.
5. **Login** e sessão por token (demo); **avaliações** persistidas (`POST/GET /api/avaliacoes*`).
6. Pedidos: **API** `POST/GET /api/pedidos` (cliente logado); persistência em **`store.json`** ou **`guiame.db`** (SQLite); apps **`/cliente/`** e **`/prestador/`** usam `sessionStorage.guiame_auth_token` após login. Estados **`novo` → `aceito` → `concluido`**: aceite pelo prestador (`POST .../aceitar`); **proposta de orçamento** (`POST .../orcamento`, valor mín. R$ 100); **fechamento** bilateral (`POST .../fechamento-*`).
7. **Pagamentos** em simulação no fluxo UI; política sugerida para cliente, prestador e parceiro — ver secção **[Pagamentos e repasses](#pagamentos-e-repasses)** abaixo. Integração com gateway é **planeada**; o ciclo de estado do pedido já inclui aceite e conclusão por confirmação das partes.
8. **Comunicação** — **chat por pedido** na API (`GET/POST /api/pedidos/<uuid>/messages`, mensagens em **`orderMessages`** no `store.json`); UI mínima em `/cliente/` e `/prestador/`. Diretriz de produto: **[Comunicação e chat](#comunicacao-chat)**.

## Pagamentos e repasses

Objetivo: **cliente** com confiança no valor e no comprovativo, **prestador** com repasse previsível e taxas claras, **parceiro (Guia-me)** com modelo sustentável sem assumir risco bancário indevido.

### Parâmetros de referência (definição atual do produto)

| Parâmetro | Valor | Notas |
|-----------|-------|--------|
| **Valor mínimo do serviço** (pagamento via app) | **R$ 100,00** | Pedidos com valor acordado **abaixo** de R$ 100,00 **não** entram no fluxo de cobrança pelo app (combinar fora ou ajustar o valor mínimo no orçamento). |
| **Comissão da plataforma (Guia-me)** | **15%** | Incide sobre o **valor pago** da transação do serviço (após confirmação pelo PSP). O prestador recebe o **líquido** (tipicamente **85%** do valor do serviço, **antes** de taxas do gateway — estas, se repassadas ao cliente ou ao prestador, devem constar à parte na UI). |
| **Taxa de deslocamento (prestador)** | **R$ 2,00 / km** (sobre km **faturados**) | O cliente indica **km só ida** (base do prestador → local); a cobrança usa **ida e volta** (km faturados = **2 × km ida**, até **150 km** na ida). Paga pelo **cliente** no **cartão cadastrado** ou **débito no saldo da conta** (app), quando o gateway estiver integrado. **Recomendação:** repasse **integral** desta taxa ao prestador; a comissão **15%** incide **só** sobre o **valor do serviço** (≥ R$ 100), **não** sobre os km — salvo alteração explícita nos termos comerciais. |
| **Cobrança no aceite (cliente)** | **Desloc. + US$ 5** | No aceite (`POST .../aceitar`), débito único no **saldo** ou **cartão**: **R$ 2,00/km** sobre **ida e volta** (2 × km ida do pedido) **+ US$ 5,00** plataforma em BRL (câmbio atualizado, USD arredondado para cima). Campos: `taxa_aceite_deslocamento_reais`, `taxa_aceite_plataforma_reais`, `taxa_aceite_total_reais`. Cotação: `GET /api/taxa-aceite/cotacao?km=`. |
| **Taxa de fechamento (prestador)** | **US$ 10,00** → **BRL** | Cobrada do **prestador** quando o pedido passa a **`concluido`** (cliente e prestador confirmaram fechamento). Mesma regra de câmbio e arredondamento para cima; débito no **saldo** ou **cartão** do prestador. Campos: `taxa_prestador_fechamento_*`. Cotação: `GET /api/taxa-prestador-fechamento/cotacao`. |

**Exemplo (só serviço, sem taxa PSP no cálculo):** serviço R$ 200,00 → comissão 15% = **R$ 30,00** (app) → base líquida prestador **R$ 170,00**. Serviço no mínimo **R$ 100,00** → comissão **R$ 15,00** → líquido prestador **R$ 85,00**.

**Exemplo com deslocamento:** serviço R$ 200,00 + **12 km ida** → km faturados **24 km** × R$ 2,00 = **R$ 48,00** de deslocamento → **R$ 248,00** total para o cliente (deslocamento **fora** da comissão 15%); prestador recebe **R$ 170,00** (líquido serviço) **+ R$ 48,00** (deslocamento) = **R$ 218,00**, e a app **R$ 30,00** — taxas PSP à parte.

### Por público

| Público | Fase **MVP** (agora) | Fase **integrada** (produção sugerida) |
|--------|----------------------|----------------------------------------|
| **Cliente** | Orçamento e pagamento **combinados fora do app** (mock); no pedido só descrição, local e referências de preço. | Pagar **no app** (PIX + cartão cadastrado, conforme gateway): **débito** do total (serviço + km ida e volta + política de comissão) no **saldo da conta** ou **cartão vinculado**; ver total, estado do pagamento e política de cancelamento/reembolso. |
| **Prestador** | Recebe conforme acordo direto com o cliente (simulação). | **Split / repasse** via gateway (ex.: Mercado Pago, Pagar.me, Stripe onde aplicável): valor líquido após taxas, extrato e previsão de crédito. |
| **Parceiro (plataforma)** | Sem cobrança real; foco em tráfego e produto. | **15%** sobre o valor pago no app (ver [Parâmetros de referência](#parâmetros-de-referência-definição-atual-do-produto)); opcional **mensalidade** ao prestador; **gateway com split** e contratos/registos adequados. |

### Modelo de negócio sugerido (produção)

1. Cobrança **no aceite do pedido** ou logo após (“confirmar e pagar”).
2. **Retenção curta** até conclusão do serviço ou confirmação do cliente, com **liberação automática** ao prestador após prazo (ex.: 48–72 h sem contestação), definido nos termos de uso.
3. **Transparência total** na UI: “Valor do serviço R$ …”, “Km ida: N · cobrança **ida e volta** (N×2 km) × R$ 2,00 = R$ …”, “Comissão Guia-me (**15%** sobre o serviço) = R$ …”, “Total cliente” e “Prestador recebe …”; lembrar **valor mínimo R$ 100,00** do serviço para pagamento pelo app.
4. **PIX** como meio prioritário no Brasil, junto de cartão, conforme o PSP escolhido.

### Débito no cliente (saldo ou cartão)

Na fase **integrada** com PSP, o valor devido pelo cliente — em linha com o que já está no pedido e na UI antes de confirmar — será **cobrado por débito** no **saldo da conta** do app ou no **cartão cadastrado** (ou outro meio vinculado: PIX, etc., conforme o gateway), conforme contrato e fluxo escolhido (reserva no aceite, captura no fechamento, etc.).

O **total a debitar** (no **saldo da conta** ou **cartão cadastrado** no PSP) inclui, em regra: **valor do serviço** (≥ R$ 100 quando pelo app), sobre o qual incide a **comissão Guia-me de 15%** (fica com a plataforma; o prestador recebe o líquido acordado do serviço), **mais** a **taxa de deslocamento** (**R$ 2,00/km** sobre km **ida e volta**, a partir do **km ida** indicado no pedido), repassada ao prestador (a comissão de 15% **não** incide sobre os km, salvo mudança explícita nos termos). O extrato do cliente deve mostrar cada rubrica e o **total debitado**.

### Critérios de cobrança (parceiro, cliente, prestador)

Critérios **sugeridos** para definir contratos e regras no app (valores concretos ficam à decisão de negócio e de contabilidade/jurídico).

| Critério | Parceiro (plataforma) | Cliente | Prestador |
|----------|------------------------|---------|-------------|
| **Base** | Comissão **15%** sobre o valor **pago** no app (valor do serviço **mín. R$ 100,00** para cobrança pelo app) e/ou **mensalidade** (listagem, selos, leads). | Paga o **valor do serviço** (≥ **R$ 100,00** quando pelo app) + **deslocamento** (**R$ 2,00/km** sobre **ida e volta**, a partir do km ida no pedido) + eventuais taxas do **gateway**; o ecrã mostra **serviço**, **km ida**, **km faturados**, **deslocamento**, **comissão 15%** (só no serviço) e **totais** antes de confirmar; débito em **saldo** ou **cartão cadastrado**. | Recebe **85%** do valor do serviço + **integral** do valor dos km (regra recomendada), **depois** de taxas do PSP **se** aplicáveis; opcional **antecipação** com custo explícito. |
| **Momento** | Comissão **no sucesso do pagamento** (captura/autorização liquidada); mensalidade **por ciclo de faturação** (ex.: mensal), independente do número de pedidos. | Cobrança **após** confirmação do valor (e antes ou no aceite do prestador, conforme modelo escolhido). | Crédito **após** conclusão + carência ou confirmação do cliente, conforme política de retenção. |
| **Pedido sem pagamento pelo app** | No MVP, **sem comissão** da plataforma sobre o que for combinado fora do app; em produção, política clara: ou **proíbe** fechamento fora do app para categorias X, ou aceita mas **sem garantia** do marketplace. | Paga **direto** ao prestador; **sem** proteção de escrow da plataforma. | Define meio próprio (PIX, etc.) — **fora** do split. |
| **Cancelamento (cliente)** | Comissão: **não** cobrar comissão se o pagamento foi **estornado integral** ao cliente; se houve trabalho/admin, política de **taxa fixa** mínima pode existir (definir nos termos). | Reembolso **integral** se cancelar antes do aceite; **parcial** ou **taxa** se cancelar após aceite ou com deslocamento já feito — **prazos** fixos (ex.: até 2 h antes). | Compensação por **no-show** do cliente pode ser prevista nos termos (valor simbólico ou %). |
| **Cancelamento (prestador)** | Comissão sobre valor **efetivamente** liquidado; se cancelar antes de executar, **devolução** ao cliente e **sem** repasse ao prestador. | **Reembolso total** em falha do prestador ou cancelamento sem execução. | Penalidade de **reputação** e, em casos graves, **suspensão**; multas financeiras só com base contratual clara. |
| **Disputa** | Taxa da plataforma: manter só o que couber após **decisão** (reembolso total/parcial); custo de **médiação** pode ser rateado ou absorvido no início. | Direito a **contestação** dentro de prazo; evidências (fotos, chat). | Direito a **defesa** e histórico de pedido. |
| **Deslocamento** | Comissão **15%** não incide sobre os km (regra recomendada); apenas gestão do split no PSP. | Paga **R$ 2,00/km** sobre **ida e volta** (a partir do **km ida** estimado) além do serviço; ver **km** e total de **km faturados** antes de confirmar; **cartão** ou **saldo em conta**. | Recebe o **valor integral** dos km (regra recomendada), além do líquido do serviço. |
| **Mínimos e arredondamentos** | **Pedido mínimo R$ 100,00** para cobrança via app; abaixo disso, fluxo fora do app ou recusa com mensagem clara. | Mostrar valor **final** com 2 casas decimais. | Extrato com **mesmo** critério de arredondamento do gateway. |

**Resumo:** comissão **15%** só sobre o **serviço** (≥ **R$ 100,00**) e **pago** pelo PSP; **deslocamento R$ 2,00/km** sobre **ida e volta** (a partir do km ida), pago pelo cliente (**saldo** ou **cartão cadastrado**) com repasse **integral** ao prestador (regra recomendada); **regras de cancelamento e disputa** escritas; **mensalidade** opcional; **nada de taxa escondida**.

### Ciclo de vida do pedido (alinhado a pagamentos)

Estados na **API** (MVP atual) e próximos passos para o UI completo:

| Estado | Significado |
|--------|-------------|
| `novo` | **Fila de espera** — cliente criou o pedido; **aguardando aceite inicial de negociação** por um prestador (`em_fila_espera: true`). |
| `aceito` | **Em negociação** — prestador deu aceite inicial (`POST .../aceitar`); orçamento, chat e fechamento; cobrança de deslocamento + US$ 5 no aceite. |
| `em_execucao` | Serviço em curso (opcional, útil para SLA e chat). |
| `concluido` | Cliente **e** prestador confirmaram o **fechamento do orçamento** (`fechamento-cliente` + `fechamento-prestador`); inicia prazo para liberação do valor / avaliação. |
| `pago` / `repasse_liberado` | Gateway confirmou repasse ao prestador (ou equivalente no extrato). |
| `cancelado` | Pedido ou pagamento cancelado segundo regras (prazo, no-show, etc.). |
| `disputa` | Contestação em análise (suporte + regras do gateway). |

### Transição MVP → gateway

- **Curto prazo:** pedido como registo com estados `novo` / `aceito` / `concluido` (fechamento bilateral); aviso explícito no front: “Pagamento a combinar / fora do app”.
- **Médio prazo:** integrar um PSP com **split**, webhooks de pagamento e campos `pagamento_id`, `pagamento_status` no pedido (persistência já em JSON ou SQLite); débito automático no **saldo da conta** ou **cartão cadastrado** do cliente para **serviço (com 15% da plataforma sobre o serviço) + km (ida e volta)**.

<a id="comunicacao-chat"></a>

## Comunicação e chat

**Diretriz de produto:** **toda** a conversa entre cliente e prestador — dúvidas, horário, detalhe do serviço, fotos de referência — deve ocorrer pelo **chat dentro do Guia-me**, associado ao **pedido** (ou à thread do interesse), no **mesmo tipo de experiência** que marketplaces como o **OLX**: histórico na plataforma, menos exposição de telefone no primeiro contacto e base para **moderação** e **suporte** em disputa.

Isto **não** implica integração técnica com o OLX; é o **modelo de UX** (chat nativo, regras de privacidade e termos). Telefone, WhatsApp ou e-mail **só** quando a política do produto e os termos o permitirem (ex.: após aceite ou após conclusão), para reduzir evasão e spam.

**MVP (implementado):** `POST /api/pedidos/<uuid>/messages` rejeita mensagens com telefone, e-mail, links, @ de redes sociais e palavras-chave de contato externo (`server/chat-policy.mjs`). O front em `/cliente/` e `/prestador/` valida antes de enviar (`shared/chat-contato-bloqueado.js`).

**MVP atual:** existe **API** de mensagens por pedido (`GET`/`POST /api/pedidos/<uuid>/messages`) com persistência em **`store.json` → `orderMessages`** (mesmo com pedidos em SQLite). Há UI mínima (carregar / enviar) nos apps **`/cliente/`** e **`/prestador/`**. Falta: notificações push/e-mail, anexos, moderação avançada e limites anti-spam por minuto.

## Próximos passos sugeridos

- **Chat por pedido** — notificações (push/e-mail), anexos opcionais, moderação e limites anti-spam; eventual migração de `orderMessages` para SQLite/Postgres se o volume crescer.
- **KYC comercial** — `KYC-INTEGRACAO.md` + `server/kyc.mjs` + `POST /api/kyc/webhook` (stub); metadados `kyc_*` no `perfil` ao cadastrar/renovar.
- **Pagamentos** — PSP com PIX/cartão + **split**; transições de `status` do pedido + webhooks; política de cancelamento publicada no site/app.
- Base **PostgreSQL** alojada (Supabase/Neon, etc.) se precisar de multi-servidor; **SQLite local** já cobre pedidos sem custo extra.
- **Geo** por CEP/GPS e distância real entre cliente e prestador.
- **Notificações** (e-mail/push) quando há pedido novo ou mudança de estado.

## Estrutura

```
app-servico/
├── KYC-INTEGRACAO.md      # Guia para fechar fornecedor KYC no fim do projeto
├── server/
│   ├── index.mjs
│   ├── store.mjs
│   ├── kyc.mjs            # Ponto de extensão KYC + webhook stub
│   ├── sms.mjs            # Twilio opcional (OTP)
│   ├── pricing.mjs         # Km ida máx. 150; taxa ida+volta (R$ 2/km faturados), comissão 15%, mín. serviço R$ 100
│   ├── sqlite-orders.mjs   # Pedidos em SQLite opcional (USE_SQLITE=1, Node 22.5+)
│   ├── .env.example
│   └── data/              # store.json em runtime (gitignored)
├── apps/
│   ├── cliente/           # index, cadastro, login, renovar-biometria
│   └── prestador/
├── shared/                # styles.css, script.js, cadastro.*, catálogo, pedidos…
├── package.json           # script "start" (sem deps)
├── iniciar-com-api.ps1
├── servidor-local.ps1
├── index.html             # portal (escolher app)
├── prototipo.html         # protótipo interativo (raiz)
├── prototipo.css
├── prototipo.js
├── ROTEIRO-DEMO-60s.md
├── TESTE-FLUXO-PEDIDO-API.md
└── README.md
```

### Protótipo interativo

`prototipo.html` — passos cliente + alternância prestador; passo 3 com **Leaflet/OSM**.

### Gravar demo (~60 s)

Ver **`ROTEIRO-DEMO-60s.md`**.
