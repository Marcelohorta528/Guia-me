# Teste do fluxo de pedido, aceite, orçamento e relatórios (API)

Roteiro para validar no browser: **orçamento de referência no pedido**, **relatório do orçamento enviado pelo prestador**, **aceite**, **proposta formal** (`POST /orcamento`), **relatório entre partes** e **fechamento** — com `http://localhost:3333` (nunca `file:///`).

## Pré-requisitos

- Servidor Node: na pasta `app-servico`, `npm start` (porta **3333** por omissão).
- Confirme: `http://localhost:3333/api/health` → `"ok": true`.
- **Duas sessões:** janela normal + **janela anónima** (ou dois browsers), para cliente e prestador ao mesmo tempo.

## OTP (opcional)

- Copie `server/.env.example` para `server/.env` e defina `SKIP_OTP=1` para ignorar o código SMS no servidor (**só desenvolvimento**). Reinicie o `npm start`.
- Sem `SKIP_OTP`, use o OTP devolvido pelo fluxo de cadastro ou `POST /api/sms/dev-send`.

## 1. Contas

1. **Cliente:** `http://localhost:3333/cliente/cadastro.html` — telefone **único** (ex.: `11988887777`), **senha**, conclua o cadastro; depois `http://localhost:3333/cliente/login.html` → app em `/cliente/`.
2. **Prestador:** `http://localhost:3333/prestador/cadastro.html` — **outro** telefone (ex.: `11988886666`), **mesma cidade e bairro** que vai usar no pedido, e **serviços** compatíveis. Login em `/prestador/login.html` → app em `/prestador/`.

## 2. Pedido (cliente)

- Abra `http://localhost:3333/cliente/`.
- Preencha **cidade / bairro** alinhados ao perfil do prestador, **serviços** (catálogo), **descrição**.
- Opcional: **valor do serviço** (ex.: `150`, mín. 100 se quiser comissão na API), **km** de deslocamento — aparecem no bloco **«Orçamento de referência no pedido»**.
- **Enviar pedido** — o pedido entra na **fila de espera** (`status` `novo`, `em_fila_espera: true`).
- Secção **«7. Acompanhar pedidos (API)»** → **Atualizar lista**.
- Verifique:
  - Estado **«Na fila de espera»** e texto *aguardando aceite inicial de negociação*.
  - **Orçamento de referência no pedido** (sempre; indica se já houve aceite ou não).
  - **Relatório do orçamento enviado pelo prestador** (mensagem adequada enquanto está na fila).

## 3. Aceite inicial de negociação (prestador) e taxa de aceite

- `http://localhost:3333/prestador/` → **Pedidos reais (API)**.
- Em **«Fila de espera — solicitações na sua área»**, cada cartão tem **«Aceitar e iniciar negociação»** (só na fila; não existe na página do cliente).
- Ao aceitar, o pedido **sai da fila** (`status` → `aceito`, `em_fila_espera: false`) e o servidor debita do **cliente** (saldo ou cartão), em **uma única cobrança** com discriminação:
  1. **Deslocamento:** **R$ 2,00/km** sobre **ida e volta** (km faturados = 2 × km só ida do pedido; máx. 150 km na ida).
  2. **Taxa plataforma:** **US$ 5,00** convertidos para real (câmbio USD/BRL; **arredondado para cima**).
  3. **Total debitado** = deslocamento + taxa plataforma (campos `taxa_aceite_deslocamento_reais`, `taxa_aceite_plataforma_reais`, `taxa_aceite_total_reais`).
- Após aceitar, o pedido aparece em **«Em negociação e concluídos»** com estado **«Em negociação»** e o bloco **«Taxa de aceite (plataforma)»** quando a cobrança foi registada.

**Cliente sem meio de pagamento:** o aceite falha com mensagem de erro (ex.: saldo insuficiente e sem cartão). Em desenvolvimento, defina `CLIENTE_SALDO_INICIAL_DEV=100` em `server/.env` para novos cadastros ou cadastre cartão no perfil (MVP: cartão simulado por omissão no cadastro).

**Cotação (sem login):** `GET http://localhost:3333/api/taxa-aceite/cotacao?km=12` → `deslocamento`, `plataforma`, `total_reais`.

**Câmbio fixo (testes):** `FX_USD_BRL=5.90` em `server/.env`.

**Se o pedido não aparecer na fila:** ajuste cidade, bairro e serviços do prestador para coincidirem com o pedido.

## 4. Proposta formal (prestador)

- Em **«Os meus pedidos»**, com estado **aceito**, use **Enviar proposta de orçamento** / **Atualizar proposta**.
- **Valor ≥ 100** (regra do app na API); observação opcional.

## 5. Confirmação no cliente

- Na janela do cliente: **Atualizar lista** em **7. Acompanhar pedidos (API)** — o pedido deve mostrar **«Em negociação»** (já não está na fila).
- Verifique:
  - **Cobrança no aceite (cliente)** — deslocamento R$ 2/km ida e volta + US$ 5 plataforma + **total debitado**, após o prestador aceitar.
  - **Serviço concluído com garantia** — após prestador enviar NF/recibo (3 meses).
  - Menu **Pagamentos** — cotação atual e saldo/cartão (`GET /api/auth/me`).
  - **Relatório do orçamento enviado pelo prestador** (valor, comissão ref., data, observação).
  - **Relatório do orçamento entre as partes** (após aceite).
  - **Fechamento do orçamento** e **chat** se aplicável.

## 5b. NF/recibo → serviço concluído (garantia 3 meses)

- **Fechamento do orçamento** (cliente + prestador): apenas regista o **acordo de valor** — **não** conclui o serviço.
- **Conclusão do serviço:** o **prestador** envia **NF ou recibo em PDF** (`POST /api/pedidos/:id/documento-fiscal`) com o pedido em estado **`aceito`**.
- Efeitos do envio: estado → **`concluido`**, **`garantia_ate`** = +3 meses, taxa **US$ 10** do prestador debitada, cliente recebe o PDF.
- **Cliente:** Conta → **NF e recibos** ou cartão do pedido → **Abrir PDF** (`GET /api/pedidos/:id/documento-fiscal`).
- Lista: `GET /api/conta/documentos-fiscais`.

## 6. Fechamento do orçamento (opcional, antes da NF)

- Cliente e prestador podem **Confirmar fechamento do orçamento** — só confirma o acordo; o pedido permanece **`aceito`** até o envio da NF.
- A **taxa US$ 10** do prestador cobra-se no envio da NF (secção 5b), não no fechamento do orçamento.

## Porta ocupada

Se `EADDRINUSE` na 3333, pare o processo antigo ou inicie com outra porta, por exemplo no PowerShell:

```powershell
$env:PORT = "3334"; npm start
```

Abra então `http://localhost:3334/...`.

## Referência de API

- `README.md` — tabela de rotas (`POST /api/pedidos`, `.../aceitar`, `.../orcamento`, `.../fechamento-*`).

---

## Continuação — checklist rápido

Use como **checklist** ao gravar ou repetir o teste.

| Passo | Cliente | Prestador |
|--------|---------|-------------|
| 1 | Login em `/cliente/login.html` | Login em `/prestador/login.html` (outra janela) |
| 2 | `/cliente/` → enviar pedido | — |
| 3 | Secção 6 → **Atualizar lista** → vê referência + relatório vazio | `/prestador/` → **Atualizar lista** |
| 4 | — | Fila → **Aceitar pedido** |
| 5 | **Atualizar lista** → aceite sim + relatório entre partes | **Os meus pedidos** → **Enviar proposta** (≥ 100) |
| 6 | **Atualizar lista** → vê proposta do prestador | — |
| 7 | **Confirmar fechamento** (cliente) | **Confirmar fechamento** (prestador) |
| 8 | Estado **concluído** nos dois lados | Idem |

## Ordem dos blocos no cartão (cliente)

Depois de aceite, em cada pedido na secção **6**, a ordem típica é:

1. Resumo (id, estado, descrição, prestador).
2. **Orçamento de referência no pedido** — o que foi indicado na criação (sempre).
3. **Relatório do orçamento enviado pelo prestador** — proposta formal após `POST /orcamento`.
4. **Relatório do orçamento entre as partes** — visão conjunta (só com pedido aceite/concluído).
5. **Fechamento do orçamento** — botões se estado `aceito`.
6. **Chat** — carregar mensagens / enviar.

## Chat (opcional, mesmo teste)

**Regra do app:** conversa **só pelo chat** — não pode enviar telefone, WhatsApp, e-mail, links nem pedir contato externo (`server/chat-policy.mjs` + validação no browser).

1. Com pedido **aceito**, no cartão: **Carregar mensagens** → **Enviar** uma mensagem normal (ex.: `Posso receber amanhã de manhã?`) → deve gravar.
2. Na outra janela (`/cliente/` ou `/prestador/`), carregar de novo e confirmar que a mensagem aparece.
3. Tentar enviar contacto externo (deve **falhar** na UI e na API):
   - `11987654321` ou `(21) 98765-4321`
   - `meu email teste@gmail.com`
   - `chama no whatsapp`
   - `https://exemplo.com`
4. Confirme o aviso amarelo acima do campo: *«Conversa apenas pelo app…»*

### Chat bloqueado — `curl` (opcional)

```powershell
curl -s -X POST "http://localhost:3333/api/pedidos/PEDIDO_ID/messages" `
  -H "Authorization: Bearer TOKEN" `
  -H "Content-Type: application/json" `
  -d "{\"body\": \"meu zap 11987654321\"}"
```

Resposta esperada: `"ok": false` e mensagem de erro sobre telefone/WhatsApp.

## Fila vazia — o que conferir

O pedido só entra na **fila de espera** (lista `pedidos` do prestador) se o servidor considerar **match** de área e serviço (`server/store.mjs`):

- **Cidade:** compara-se a parte **antes** de `—` no texto (ex.: `Rio de Janeiro — RJ` e `Rio de Janeiro` alinham após normalização).
- **Bairro:** tem de existir **à letra** (ignorando maiúsculas) na lista de bairros do prestador — use o **mesmo** bairro no pedido e no cadastro (ex.: `Copacabana`).
- **Serviços:** há sobreposição por texto entre chips do pedido e **categorias** cadastradas no prestador — escolha serviços do catálogo que o prestador também marcou (ou use a **mesma expressão** nos chips e nas categorias, para o texto coincidir).

Se mudar o perfil do prestador, **grave o cadastro** e volte a **Atualizar lista** no prestador.

## Erros esperados da API (para testar de propósito)

| Ação | Corpo / estado | Resposta típica |
|------|----------------|-----------------|
| `POST .../orcamento` com valor `50` | `< 100` | Erro de valor mínimo (regra do app) |
| `POST .../orcamento` em pedido `concluido` | — | Pedido já concluído — não alterar |
| `POST .../orcamento` sem ser o prestador atribuído | — | Erro de permissão |
| `POST .../messages` com telefone, e-mail ou link | `{ "body": "11987654321" }` | Erro — conversa só pelo app |

## Inspeção rápida com `curl` (opcional)

1. Faça login no browser e em DevTools → **Application** → **Session storage** → copie `guiame_auth_token`.
2. Substitua `TOKEN` e `PEDIDO_ID` (UUID completo do pedido).

```powershell
curl -s "http://localhost:3333/api/pedidos" -H "Authorization: Bearer TOKEN"
```

```powershell
curl -s -X POST "http://localhost:3333/api/pedidos/PEDIDO_ID/orcamento" `
  -H "Authorization: Bearer TOKEN" `
  -H "Content-Type: application/json" `
  -d "{\"valor\": 180, \"observacao\": \"Teste API\"}"
```

(O prestador tem de ser o dono atribuído e o pedido em estado `aceito`.)

## Dados e persistência

- Com **`USE_SQLITE=1`** (e Node ≥ 22.5): pedidos em `server/data/guiame.db`.
- Sem SQLite: pedidos em `server/data/store.json` → `orders`.
- Chat (`orderMessages`) continua em **`store.json`** mesmo com pedidos em SQLite.
