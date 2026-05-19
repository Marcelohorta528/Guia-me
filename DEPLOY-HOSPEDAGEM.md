# Hospedar grátis e partilhar o Guia-me Service

Guia para colocar o projeto **online com HTTPS** (link para terceiros testarem no telemóvel ou PC).

**Recomendado:** [Render](https://render.com) — plano **Free**, Node.js, URL `https://seu-app.onrender.com`.

> **Limitação do plano grátis:** o servidor “adormece” após ~15 min sem visitas (primeiro acesso pode demorar ~30–60 s). Os dados (contas, pedidos) ficam no disco **temporário** — podem **apagar-se** ao reiniciar ou fazer novo deploy. Para demo e testes com terceiros, isso costuma ser suficiente.

---

## O que precisa

1. Conta gratuita no [GitHub](https://github.com) e no [Render](https://render.com).
2. O código do projeto num repositório Git (pasta `app-servico` como **raiz** do repositório, ou ajuste `rootDir` no Render).
3. **Git** no PC (ou [GitHub Desktop](https://desktop.github.com)) para enviar o código.

---

## Passo 1 — Subir o código para o GitHub (automático)

Na pasta `app-servico`, execute:

```powershell
cd "d:\Marcelo\TUDO\Marketing Digital\Cursor\app-servico"
.\publicar-guia-me.ps1
```

O script instala Git/GitHub CLI se faltar, abre login no browser, cria o repo **`guia-me-service`** e faz push. Código em `%USERPROFILE%\guia-me-service-deploy`.

**Nota:** `server/data/store.json` e `guiame.db` estão no `.gitignore` (correto — cada ambiente cria os seus dados).

---

## Passo 2 — Criar o serviço no Render (grátis)

### Opção A — Blueprint (ficheiro já incluído)

1. No Render: **New** → **Blueprint**.
2. Ligue o repositório GitHub.
3. O Render lê o `render.yaml` desta pasta e cria o **Web Service** com variáveis de ambiente para demo.

### Opção B — Manual

1. **New** → **Web Service** → escolha o repositório.
2. Configuração:

| Campo | Valor |
|--------|--------|
| **Root Directory** | *(vazio se o repo é só `app-servico`; senão `app-servico`)* |
| **Runtime** | Node |
| **Build Command** | *(vazio)* |
| **Start Command** | `npm start` |
| **Instance type** | **Free** |

3. **Environment** (variáveis):

| Chave | Valor | Motivo |
|--------|--------|--------|
| `NODE_VERSION` | `22` | SQLite nativo (opcional) |
| `SKIP_OTP` | `1` | Demo sem SMS — OTP ignorado no servidor |
| `CLIENTE_SALDO_INICIAL_DEV` | `100` | Saldo inicial cliente (testes) |
| `PRESTADOR_SALDO_INICIAL_DEV` | `150` | Saldo inicial prestador |
| `USE_SQLITE` | `1` | Pedidos em ficheiro SQLite *(opcional; sem isto usa JSON em memória/disco)* |
| `GOOGLE_CLIENT_ID` | *(opcional)* | Botão «Continuar com Google» nas páginas de login |

4. **Health Check Path:** `/api/health`
5. **Create Web Service** e aguarde o primeiro deploy (2–5 min).

---

## Passo 3 — Partilhar o link

Quando o deploy ficar **Live**, o Render mostra um URL, por exemplo:

`https://guia-me-service.onrender.com`

Envie aos terceiros:

| Página | URL |
|--------|-----|
| Portal | `https://SEU-APP.onrender.com/` |
| App cliente | `https://SEU-APP.onrender.com/cliente/` |
| App prestador | `https://SEU-APP.onrender.com/prestador/` |
| API saúde | `https://SEU-APP.onrender.com/api/health` |

**HTTPS** está incluído — GPS e câmara no browser funcionam melhor do que em `http://` sem certificado.

### Teste rápido com terceiros

1. Um telemóvel: cadastro **cliente** → criar pedido.
2. Outro telemóvel (ou janela anónima): cadastro **prestador** — **mesma cidade, bairro e serviços** do pedido.
3. Prestador: **Fila de espera** → **Aceitar e iniciar negociação**.

Roteiro completo: `TESTE-FLUXO-PEDIDO-API.md` (troque `localhost:3333` pelo seu URL Render).

---

## Login com Google (opcional)

Nas páginas `/cliente/login.html` e `/prestador/login.html` aparece **Continuar com Google** quando o servidor tem `GOOGLE_CLIENT_ID` configurado.

### 1 — Google Cloud Console

1. Aceda a [Google Cloud Console](https://console.cloud.google.com/) → **APIs e serviços** → **Credenciais**.
2. **Criar credenciais** → **ID do cliente OAuth** → tipo **Aplicativo da Web**.
3. **Origens JavaScript autorizadas** (adicione todas as que usar):
   - `http://localhost:3333` (desenvolvimento)
   - `https://SEU-APP.onrender.com` (produção — sem barra no fim)
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).

Não é obrigatório configurar URI de redirecionamento para este fluxo (Google Identity Services com botão + `id_token`).

### 2 — Variável no servidor

**Local** — em `server/.env`:

```env
GOOGLE_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
```

Reinicie `npm start`.

**Render** — painel do serviço → **Environment** → adicione:

| Chave | Valor |
|--------|--------|
| `GOOGLE_CLIENT_ID` | o ID copiado do passo 1 |

Faça **Manual Deploy** ou um novo push para aplicar.

### 3 — Comportamento (MVP)

- Primeiro login Google **cria conta** no tipo da página (cliente ou prestador).
- Conta Google e conta por celular/senha são perfis separados, salvo coincidência futura por e-mail.
- Conta criada só com Google não aceita senha no login tradicional (mensagem explícita na API).

---

## Variáveis úteis (produção / demo)

Copie de `server/.env.example`. No Render, use o painel **Environment**, não commite `.env`.

- `SKIP_OTP=1` — só para **demo**; em produção real use SMS (Twilio) e remova.
- `GOOGLE_CLIENT_ID` — login com Google (ver secção acima).
- `FX_USD_BRL=5.90` — câmbio fixo para testes de taxa US$.
- `TWILIO_*` — SMS real (ver `.env.example`).

---

## Outras opções gratuitas (resumo)

| Plataforma | Prós | Contras |
|-----------|------|---------|
| **Render** | Simples, HTTPS, Node puro | Dorme no free; disco efémero |
| **Fly.io** | Pode usar volume persistente | Configuração mais técnica (`fly.toml`) |
| **Glitch** | Muito fácil para protótipo | Limites de uso; Node parcial |
| **Vercel / Netlify** | Ótimo para sites estáticos | API Node precisa de adaptação — **não** use sem refatorar |

Este projeto é **um servidor Node único** (`server/index.mjs`) — Render ou Fly.io encaixam melhor.

---

## Problemas comuns

**Deploy falha “Node version”**  
Defina `NODE_VERSION=22` nas variáveis de ambiente.

**Pedido não aparece na fila do prestador**  
Cidade, bairro e **serviços** do prestador têm de coincidir com o pedido do cliente.

**Site lento na primeira visita**  
Plano free do Render — aguarde o “wake up” após inatividade.

**Dados sumiram**  
Normal no disco efémero; novo deploy ou reinício limpa contas/pedidos. Para persistência paga, use disco persistente no Render ou base de dados externa (futuro).

**Geolocalização / mapa**  
Use sempre o URL **https://** do Render, não IP nem `http://`.

---

## Atualizar o site online

Depois de alterar o código localmente:

```powershell
git add .
git commit -m "Atualização"
git push
```

O Render faz **deploy automático** em cada push na branch ligada (geralmente `main`).
