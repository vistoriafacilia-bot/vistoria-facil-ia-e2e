# VF-ZERO-COST-GATE-001 - diagnostico e plano sem billing

Data: 2026-06-25

Status: READY_FOR_ZERO_COST_PLAN

UAT: NAO LIBERADO

## Decisao operacional

Gustavo escolheu manter custo zero em sentido estrito: nao habilitar billing no Google Cloud e nao usar Cloud Run, Cloud Build nem Artifact Registry.

Conclusao objetiva: existe caminho viavel para um gate zero-cost limitado a frontend estatico, Firebase Auth e Firestore client-side. Nao existe caminho zero-cost estrito para validar backend `/api`, IA Gemini server-side, Mercado Pago, Cloud Functions, Cloud Run, Artifact Registry, Cloud Build ou Cloud Storage for Firebase real. Pela documentacao atual do Firebase, Cloud Storage for Firebase exige projeto no plano Blaze; em Spark/no billing, chamadas ao bucket falham com 402/403.

## Fontes oficiais verificadas

- Firebase Pricing: Spark tem no-cost usage limits e nao exige payment method; Cloud Run, Cloud Build e Artifact Registry aparecem como "Not applicable" no Spark.
  URL: https://firebase.google.com/pricing
- Firebase Storage FAQ: Cloud Storage for Firebase requer Blaze; projetos Spark nao tem acesso a buckets e chamadas retornam 402/403.
  URL: https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- Cloud Run source deploy: `gcloud run deploy SERVICE --source .` e um fluxo de build/deploy de Cloud Run.
  URL: https://docs.cloud.google.com/run/docs/deploying-source-code
- Firebase Hosting rewrites: bloco `run` em `hosting.rewrites` direciona requests de Hosting para Cloud Run.
  URL: https://firebase.google.com/docs/hosting/full-config#rewrite-cloud-run-container

## Auditoria de dependencias

| Area | Evidencia local | Classificacao zero-cost |
| --- | --- | --- |
| `/api` | `server.ts` define `/api/health`, `/api/payments/create-checkout`, `/api/payments/mercadopago/webhook`, `/api/analyze-image`. `InspectionWizard.tsx` chama `/api/analyze-image`; `PlanGate.tsx` chama `/api/payments/create-checkout`; `vf-real-staging.spec.ts` chama `/api/health`. | Excluir do gate zero-cost. Requer backend real. |
| `server.ts` | Express, `@google/genai`, Mercado Pago, Firestore REST com token de metadata server e variaveis server-side. | Excluir. Sem Cloud Run/Functions nao ha runtime para esse backend. |
| Cloud Run | `.github/workflows/e2e.yml` usa `gcloud run deploy "$CLOUD_RUN_SERVICE" --source .`; `firebase.json` tem rewrite `/api/**` para `run.serviceId`. | Remover/desabilitar/separar antes de qualquer deploy zero-cost. |
| Cloud Build | O deploy atual usa `gcloud run deploy --source .`, que aciona fluxo de build/deploy do Cloud Run. | Proibido no gate zero-cost. |
| Artifact Registry | Dependencia operacional indireta do deploy Cloud Run/container. Firebase Pricing marca Artifact Registry como not applicable no Spark. | Proibido no gate zero-cost. |
| Cloud Functions | Nao ha import ativo de `firebase/functions` nem bloco `functions` em `firebase.json`. Apenas docs/planos antigos citam Functions. | Nao introduzir. Excluir por exigir billing/Blaze para deploy real. |
| Gemini server-side | `server.ts` instancia `GoogleGenAI` e `/api/analyze-image`; `InspectionWizard.tsx` tolera falha e aplica fallback/manual review. | IA automatica excluida. Revisao manual/fallback pode entrar se houver foto valida, mas Storage bloqueia foto real em Spark. |
| Mercado Pago | `PlanGate.tsx` usa `/api/payments/create-checkout`; `server.ts` cria checkout e webhook Mercado Pago. | Excluir. Plano gratuito client-side permanece possivel. |
| Geracao PDF backend | Nao encontrada. PDF usa `jsPDF` no browser em `ReportPdfGenerator.tsx`. | Geracao local existe, mas persistencia do PDF usa Storage e nao passa em Spark/no billing sem alteracao de produto. |
| Firestore real | `src/firebase.ts`, `PropertyManager`, `InspectionWizard`, `PlanGate`, `entitlements` usam Firestore client-side; regras permitem owner-scoped data e entitlement gratuito. | Permitido no gate zero-cost dentro de quotas Spark. |
| Firebase Auth | `src/firebase.ts` usa Auth real, incluindo Email/Password. Testes reais aceitam formulario tecnico staging. | Permitido no gate zero-cost dentro de limites Spark. |
| Firebase Storage | `InspectionWizard.tsx` exige `uploadBytes` antes de salvar foto; `ReportPdfGenerator.tsx` exige upload do PDF antes de marcar `pdf_gerado`; `storage.rules` controla fotos/PDFs. | Excluir em no-billing estrito. Cloud Storage for Firebase exige Blaze. |

## Classificacao de fluxos

### A) Pode rodar em custo zero estrito

- Frontend SPA estatico no Firebase Hosting, sem rewrite `/api/**`.
- Firebase Auth Email/Password real para usuario tecnico E2E.
- Firestore client-side com regras reais:
  - login e bootstrap de usuario;
  - leitura/criacao do entitlement gratuito `free_10` com `source=free_self_service`;
  - listagem/criacao/edicao/exclusao de imoveis do usuario;
  - criacao de vistoria, selecao Entrada/Saida, rascunho e historico;
  - criacao/renomeacao de comodos;
  - persistencia e reload de estado Firestore;
  - bloqueio esperado de concluir vistoria sem foto.
- Seed/cleanup Firestore via Identity Toolkit/Firestore REST, desde que nao tente Storage.
- CI local/gates sem `VITE_E2E_MODE=true` para staging zero-cost, desde que a suite nao cubra `/api` nem Storage.

### B) Depende de backend/API/billing e nao entra no UAT zero-cost

- `/api/health`.
- `/api/analyze-image` e qualquer afirmacao de Gemini configurado.
- Retry de IA real via backend.
- `/api/payments/create-checkout`.
- Webhook Mercado Pago.
- Escritas server-side em `orders`, `payments`, `webhook_events` e entitlements pagos.
- Cloud Run, Cloud Functions, Cloud Build, Artifact Registry.
- Upload/leitura/cleanup real de Firebase Storage em projeto Spark/no billing.
- Upload de fotos pela UI atual, porque falha de Storage interrompe o fluxo antes de salvar a foto.
- Persistencia de PDF em Storage e status `pdf_gerado` no fluxo atual.
- Testes atuais `VF-E2E-007 REAL` e `VF-E2E-009 REAL` sem adaptacao, pois exigem Storage e/ou `/api/health`.

### C) Exige decisao de produto

- Se o gate zero-cost sera apenas um smoke funcional de Auth/Firestore/Hosting ou se precisa ser chamado de UAT parcial. Recomendacao: chamar apenas de gate zero-cost, nao UAT.
- Se foto/PDF sao obrigatorios para qualquer validacao aceitavel. Se sim, zero-cost estrito fica bloqueado por Storage.
- Se o app deve ganhar modo de produto "sem Storage" com captura local/base64/sem persistencia, sabendo que isso nao valida o produto real de fotos.
- Se PDF local sem upload deve ser considerado sucesso operacional. Hoje o fluxo salva localmente, mas tenta Storage em seguida e exibe erro se Storage falha.
- Se plano pago/Mercado Pago deve ficar oculto/desabilitado em staging zero-cost para evitar chamadas `/api`.
- Se IA automatica deve ser substituida por revisao manual no recorte zero-cost ou ficar completamente fora do gate.

## Auditoria do workflow atual

Manter:

- Job `gates-and-e2e`, pois roda lint, testes, build e E2E local mockado sem deploy GCP.

Remover, desabilitar ou separar para outro workflow pago:

- Job atual `deploy-staging-and-real-e2e` como esta.
- Step `Setup gcloud`.
- Step `Deploy Cloud Run staging API`.
- Qualquer `gcloud run deploy`, especialmente com `--source .`.
- Variaveis `CLOUD_RUN_REGION` e `CLOUD_RUN_SERVICE` no job zero-cost.
- Secrets `GEMINI_API_KEY_STAGING` e `MERCADOPAGO_ACCESS_TOKEN_STAGING` no job zero-cost.
- Assertivas de `/api/health` e `geminiConfigured` na suite zero-cost.
- Deploy de `storage.rules` e uso de `FIREBASE_STORAGE_BUCKET` enquanto billing estiver proibido.
- Rewrite `/api/**` com bloco `run` no config de Hosting usado pelo deploy zero-cost.

Substituir por:

- Config separado, por exemplo `firebase.zero-cost.json`, contendo apenas Hosting SPA fallback e Firestore rules.
- Script separado de deploy futuro, por exemplo `deploy:zero-cost:firebase`, com `firebase deploy --only hosting,firestore:rules --config firebase.zero-cost.json`.
- Suite separada, por exemplo `tests/e2e-zero-cost`, sem chamadas `/api`, sem upload Storage e sem Mercado Pago.
- Guard estatico no CI zero-cost que falha se o workflow/config contem `gcloud run`, `--source .`, bloco `hosting.rewrites[].run` ou deploy `storage`.

## Gate proposto: VF-ZERO-COST-GATE-001

### Escopo permitido

- Hosting estatico do SPA.
- Firebase Auth Email/Password real.
- Firestore real com namespace/testRunId para seed/cleanup.
- Entitlement gratuito client-side.
- Propriedades, vistorias, comodos, historico, reload e bloqueio sem foto.
- Evidencias de que nenhuma etapa acionou Cloud Run, Cloud Build, Artifact Registry, Cloud Functions ou Storage.

### Escopo excluido

- UAT formal completo.
- Fotos reais via Firebase Storage.
- PDF persistido em Storage.
- IA Gemini real.
- Mercado Pago checkout/webhook.
- Qualquer endpoint `/api`.
- Qualquer deploy backend.

### Testes necessarios

- `VF-ZC-001`: login real Email/Password e home carregada.
- `VF-ZC-002`: entitlement gratuito criado/lido no Firestore.
- `VF-ZC-003`: imovel seed aparece e pertence ao usuario tecnico.
- `VF-ZC-004`: nova vistoria abre selecao Entrada/Saida.
- `VF-ZC-005`: comodo criado/renomeado persiste no Firestore.
- `VF-ZC-006`: historico retoma rascunho.
- `VF-ZC-007`: nova vistoria nao retoma rascunho silenciosamente.
- `VF-ZC-008`: reload mantem usuario, imovel e rascunho.
- `VF-ZC-009`: concluir sem foto permanece bloqueado com mensagem esperada.
- `VF-ZC-010`: guard tecnico confirma ausencia de Cloud Run/Build/Artifact/Functions/Storage no workflow/config zero-cost.

### Criterios de PASS

- Nenhum step executa `gcloud run`, Cloud Run, Cloud Build, Artifact Registry ou Cloud Functions.
- Firebase Hosting estatico e Firestore rules sao os unicos alvos de deploy.
- Config de Hosting usada no gate nao contem rewrite `run`.
- Suite zero-cost passa contra ambiente real com Auth/Firestore, sem `VITE_E2E_MODE=true`.
- Seed/cleanup remove dados Firestore do `STAGING_TEST_RUN_ID`.
- Evidencias formais geradas sem secrets e sem logs sensiveis.
- Relatorio declara explicitamente que fotos/PDF/IA/pagamento estao fora do escopo.

### Criterios de FAIL

- Qualquer step tenta Cloud Run, Cloud Build, Artifact Registry, Cloud Functions ou Storage.
- Qualquer teste permitido chama `/api`.
- O app exige Storage para os fluxos permitidos.
- Auth ou Firestore real falham por regras/config.
- Dados de seed/cleanup ficam fora do namespace/testRunId.

### Criterios de BLOCKED

- O projeto Firebase nao permite Auth/Firestore/Hosting em Spark/no billing.
- O produto exige fotos reais, PDF persistido, IA real ou pagamento para considerar a validacao util.
- Gustavo nao autoriza separar config/workflow zero-cost do workflow Cloud Run atual.
- A conta tecnica E2E Email/Password nao pode ser criada/fornecida sem expor segredo.

## Riscos explicitos

- Zero-cost estrito nao valida o principal diferencial de midia: foto real, Storage, PDF persistido e cleanup de objetos.
- IA automatica vira escopo excluido; o comportamento validado e apenas tolerancia/manual review, quando aplicavel.
- Mercado Pago e entitlements pagos nao sao cobertos.
- Hosting estatico sem `/api` pode deixar botoes de plano pago ou retry de IA retornarem erro; esses caminhos precisam ser bloqueados por teste negativo ou decisao de produto.
- Cotas Spark de Auth/Firestore/Hosting continuam existindo; passar o gate nao equivale a capacidade de producao.
- Nao ha UAT liberado enquanto os fluxos excluidos forem requisitos de produto.

## Proxima alteracao minima recomendada

Criar um branch/commit especifico para separar o gate zero-cost:

1. Adicionar `firebase.zero-cost.json` sem rewrite `/api/**` e sem Storage.
2. Adicionar script `deploy:zero-cost:firebase` com Hosting + Firestore rules apenas.
3. Adicionar suite `e2e:zero-cost:staging` cobrindo `VF-ZC-001` a `VF-ZC-010`.
4. Ajustar workflow para ter job manual `deploy-zero-cost-staging` separado do job pago/Cloud Run.
5. Manter `deploy-staging-and-real-e2e` desabilitado ou documentado como gate pago, nao executavel sem billing.

## Status final

READY_FOR_ZERO_COST_PLAN

UAT NAO LIBERADO.
