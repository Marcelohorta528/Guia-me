# Backend — Guia-me Service

API REST em **Node.js** (sem dependências npm), porta **3333** por omissão.

## Estrutura

```
server/
├── index.mjs          # Arranque HTTP (API + ficheiros estáticos)
├── api/
│   └── register.mjs   # Todas as rotas /api/*
├── lib/
│   ├── http.mjs       # JSON, CORS, body, Bearer token
│   └── router.mjs     # Router GET/POST (path ou RegExp)
├── static.mjs         # Portal + apps cliente/prestador
├── store.mjs          # Persistência (JSON + lógica de negócio)
├── sqlite-orders.mjs  # Pedidos em SQLite (opcional)
├── kyc.mjs, sms.mjs, pricing.mjs, …
└── data/
    ├── store.json     # Contas, sessões, chat, avaliações
    └── guiame.db      # Pedidos (se USE_SQLITE=1)
```

## Arrancar

```powershell
cd C:\Users\PC\Guia-me
npm start
```

Teste: **GET** http://localhost:3333/api/health

## Camadas

| Camada | Ficheiro | Função |
|--------|----------|--------|
| **Rotas** | `api/register.mjs` | Mapeia URL → handler |
| **Negócio** | `store.mjs` | Cadastro, login, pedidos, chat |
| **Dados** | `data/store.json` + SQLite | Gravação local |

## Painel admin (transações)

Página: **http://localhost:3333/admin/**

API: `GET /api/admin/transacoes?key=<ADMIN_KEY>`

Chave padrão em desenvolvimento: `guia-me-dev` (defina `ADMIN_KEY` no `.env` em produção).

## Rotas principais

| Grupo | Exemplos |
|-------|----------|
| Admin | `GET /api/admin/transacoes` |
| Saúde | `GET /api/health` |
| Auth | `POST /api/auth/login`, `GET /api/auth/me` |
| Cadastro | `POST /api/cadastro/cliente`, `/prestador` |
| Pedidos | `POST/GET /api/pedidos`, `.../aceitar`, `.../orcamento` |
| Chat | `GET/POST /api/pedidos/:id/messages` |
| SMS dev | `POST /api/sms/dev-send` |

Lista completa: `README.md`.

## Variáveis (.env)

Copie `server/.env.example` → `server/.env`:

- `SKIP_OTP=1` — só desenvolvimento
- `USE_SQLITE=1` — pedidos em SQLite (Node 22.5+)
- `GOOGLE_CLIENT_ID` — login Google
- `TWILIO_*` — SMS real

## Adicionar uma rota nova

1. Abra `server/api/register.mjs`
2. Registe no router:

```javascript
router.get('/api/minha-rota', async ({ req, res, url }) => {
  json(res, 200, { ok: true, dados: '...' });
});
```

3. Se precisar de BD, implemente a função em `store.mjs`
4. Reinicie: `npm start`

## Próximos passos (produção)

- PostgreSQL (Supabase/Neon) em vez de só JSON local
- Webhooks de pagamento (PSP)
- KYC real (`KYC-INTEGRACAO.md`)
- Autenticação JWT com refresh token
