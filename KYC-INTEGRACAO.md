# Integração KYC — pronto para fechar fornecedor no fim do projeto

Este documento descreve **o que já existe** no Guia-me Service e **onde ligar** o KYC comercial (liveness, documento, lista restritiva, etc.) após escolher e pagar o fornecedor.

## Estado atual (demo)

| Peça | Comportamento |
|------|----------------|
| **Cadastro** cliente e prestador | Passo “Rosto”: câmara + `FaceDetector` no browser **ou** confirmação manual. **Nenhuma imagem** é enviada ao servidor. |
| **Servidor** | Exige `biometriaFaceOk === "1"` no JSON do cadastro. Grava `biometria_face_at`, `biometria_face_ciclo_dias` (30), `biometria_face_metodo`. |
| **Renovação mensal** | `GET /api/auth/me` devolve `biometriaFacial.precisaRenovar`. Login redireciona para `renovar-biometria.html`. `POST /api/auth/biometria-renovar` atualiza a data. |
| **Metadados KYC** | `server/kyc.mjs` injeta campos `kyc_*` no `perfil` (ver abaixo) para auditoria e para substituir o modo `local` por `provider` sem mudar o formato do `store.json`. |

Isto **não substui** um fornecedor KYC certificado: não há prova legal forte, template facial persistente no fornecedor, nem antifraude completo.

---

## Modos (`KYC_MODE`)

| Valor | Uso |
|--------|-----|
| `local` (padrão se vazio) | Mantém o fluxo atual no browser. |
| `provider` | **A implementar** após contrato: SDK no front + API no servidor + webhook. Enquanto não implementado, o cadastro pode falhar se ativar `KYC_STRICT=1` (ver `server/kyc.mjs`). |

Variáveis sugeridas: ver `server/.env.example` (secção KYC).

---

## Ficheiros a alterar quando comprar o KYC

1. **`server/kyc.mjs`** — Lógica do fornecedor: criar sessão, validar resultado, assinar webhook, mapear estados para `biometria_face_at` / `kyc_*`.
2. **`server/store.mjs`** — `registerCadastro` e `renovarBiometriaFacial` já chamam `mergeKycMetadataIntoPerfil` / `touchKycRenewalMetadata`. Poderá ser preciso gravar `kyc_applicant_id`, `kyc_check_id`, `kyc_status` conforme o fornecedor.
3. **`cadastro-face.js`** e **`renovar-biometria.html`** — Substituir ou emendar o fluxo por **Web SDK** do fornecedor (iframe / redirect / captura nativa).
4. **`server/index.mjs`** — Rota `POST /api/kyc/webhook` hoje é **stub**; deve validar assinatura (`KYC_WEBHOOK_SECRET`) e atualizar a conta no `store`.
5. **Front de pedidos / área logada** — Se o KYC bloquear uso sem verificação aprovada, esconder ações até `kyc_status === 'approved'` (definição tua + fornecedor).

---

## Contrato sugerido com o fornecedor (alinhamento comercial)

Pedir ao fornecedor documentação sobre:

- **Liveness** e **match** documento + selfie (se aplicável a cliente e prestador).
- **Webhooks** (URL pública HTTPS, retries, idempotência).
- **Retenção de dados** e **subprocessadores** (LGPD / contrato de tratamento).
- **Sandbox** (chaves de teste) vs **produção**.
- **Preço** por verificação vs pacote; limites de API.

Campos no `perfil` que podes passar a preencher (exemplos; nomes finais dependem do fornecedor):

- `kyc_applicant_id`, `kyc_check_id`, `kyc_status` (`pending` | `approved` | `rejected`).
- `kyc_provedor_slug` (ex.: `idwall`, `onfido`, …).
- Manter `biometria_face_at` como **data da última verificação aprovada** no teu domínio (já usada pelo ciclo de 30 dias).

---

## LGPD (resumo)

- Base legal, consentimento explícito, política de privacidade, DPO se necessário.
- Minimizar dados; não duplicar biometria se o fornecedor já for responsável pelo tratamento.
- Prazo de conservação e pedido de eliminação.

---

## Teste rápido do webhook (stub)

```bash
curl -s -X POST http://localhost:3333/api/kyc/webhook \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"ping\"}"
```

Resposta atual: JSON de stub — substituir por processamento real em `server/kyc.mjs`.

---

## Checklist antes de ir a produção

- [ ] `KYC_MODE=provider` + chaves em `.env` (não commitar segredos).
- [ ] Webhook com HTTPS e validação de assinatura.
- [ ] SDK no cadastro + renovação; testes em sandbox.
- [ ] Fluxo de rejeição e apoio ao utilizador.
- [ ] Textos legais (Termos / Privacidade) alinhados com o fornecedor.
- [ ] Remover ou desativar `SKIP_OTP` e demo OTP em produção.
