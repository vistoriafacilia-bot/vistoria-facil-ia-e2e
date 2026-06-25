# SR-01 - Staging Real Unlock Plan

Status: draft aprovado para execucao controlada

UAT: nao liberado

## Objetivo

Preparar o desbloqueio do staging real antes de qualquer UAT. Esta etapa cobre Git remoto, CI, Firebase Hosting, Cloud Run para backend, Auth E2E automatizavel, Firestore, Storage, IA/backend e Mercado Pago sandbox.

## Escopo

- Promover o repositorio local para um remoto Git valido.
- Executar CI remoto em GitHub Actions.
- Publicar frontend em Firebase Hosting staging.
- Publicar `server.ts` como backend real em Cloud Run staging.
- Configurar rewrite `/api/**` do Firebase Hosting para Cloud Run.
- Configurar Firebase Auth, Firestore e Storage reais de staging.
- Definir Auth E2E sem Google OAuth interativo.
- Executar Playwright VF-E2E-001 a VF-E2E-010 contra staging real.
- Validar IA/backend e Mercado Pago sandbox.
- Gerar evidencias formais sem secrets.

## Fora de escopo

- UAT.
- Publicacao beta.
- Alteracao de producao.
- Pagamento real.
- Commit de secrets.
- Logs com tokens ou credenciais.
- Mudanca de fluxo de produto sem registro explicito.

## Base atual

- Repositorio local: `C:\Users\gusta\OneDrive\Documentos\Growth Agent - Vistoria Facil\vistoria-facil-ia-staging`
- Evidencia atual: `qa\staging_real_evidence_20260625.md`
- RC2 mock/local: validado.
- Staging real: bloqueado.
- UAT: bloqueado.

Commits locais informados:

- `6060ed6` pacote RC2 promovido com E2E gates
- `13b7d80` CI/staging real/evidencias
- `7d2b7fa` ajuste final da evidencia

Observacao read-only SR-01: o worktree local contem alteracoes nao commitadas. Antes de push remoto, decidir se essas alteracoes fazem parte do pacote staging real ou se devem ficar fora do gate.

## Arquitetura alvo

```text
GitHub repo
  -> GitHub Actions environment: staging
  -> build frontend
  -> build backend server.ts
  -> deploy Firebase Hosting + rules
  -> deploy Cloud Run backend
  -> Firebase Hosting rewrite /api/** -> Cloud Run
  -> Playwright real staging sem mocks enganosos
  -> evidencias formais
```

## Decisoes tecnicas assumidas

1. Backend staging deve ser Cloud Run porque o projeto usa `server.ts`/Express.
2. Firebase Hosting deve reescrever `/api/**` para Cloud Run.
3. Firebase CLI em CI deve autenticar por service account / Application Default Credentials.
4. Playwright staging real nao deve depender de Google OAuth interativo.
5. Estrategia preferencial de Auth E2E: staging test user com email/senha + `storageState`.
6. Alternativa controlada: endpoint E2E-only com Firebase custom token, protegido por env e secret.
7. Mercado Pago deve ser validado em sandbox antes de UAT.
8. Firestore e Storage devem ser testados com regras reais de staging.
9. `VITE_E2E_MODE=true` pode existir apenas para harness local/staging controlado; a suite de aceite staging real deve rodar sem mock enganoso.

## Plano executavel

### Fase 1 - Preflight de repositorio

- Verificar `git status --short`.
- Separar alteracoes ja existentes das alteracoes SR-01.
- Validar remoto GitHub e metodo de autenticacao.
- Fazer push para branch staging ou main conforme politica aprovada.
- Capturar commit hash remoto.

### Fase 2 - GitHub Actions

- Configurar environment `staging`.
- Cadastrar secrets via UI/CLI segura, nunca no chat.
- Rodar job local de gates e E2E mockado.
- Rodar job manual `deploy-staging-and-real-e2e`.
- Capturar URL do workflow run.

### Fase 3 - Firebase staging

- Confirmar projeto Firebase staging.
- Validar service account com escopo minimo.
- Deploy de Hosting, Firestore Rules e Storage Rules.
- Capturar Hosting URL e output redigido.

### Fase 4 - Backend Cloud Run

- Buildar `server.ts` como backend.
- Publicar imagem em Artifact Registry ou fluxo equivalente.
- Deploy Cloud Run com `SERVER_ENV=staging`.
- Validar `/api/health`.
- Validar rewrite `/api/**` via Hosting.

### Fase 5 - Auth E2E

- Criar usuario de teste staging com email/senha.
- Seedar entitlement e dados minimos no Firestore staging.
- Gerar `storageState` via Playwright sem expor senha.
- Bloquear dependencia de Google OAuth interativo.

### Fase 6 - Firestore/Storage reais

- Validar regras reais com usuario autenticado.
- Testar read/write/delete permitido e negado.
- Testar upload, leitura e remocao controlada de foto.
- Capturar relatorio sem dados sensiveis.

### Fase 7 - IA/backend e Mercado Pago sandbox

- Validar contrato de `/api/analyze-image` ou endpoint equivalente.
- Validar que backend usa Firebase Admin em staging.
- Criar pagamento Mercado Pago sandbox.
- Validar webhook ou retorno de status sandbox.
- Validar entitlement pos-pagamento.

### Fase 8 - E2E staging real

- Rodar VF-E2E-001 a VF-E2E-010 contra `STAGING_BASE_URL`.
- Remover `VITE_E2E_MODE=true` da execucao de aceite real.
- Capturar Playwright report, traces, videos e JSON.
- Comparar divergencias mocks vs integracoes reais.

### Fase 9 - Freeze de RC staging real

- Consolidar evidencias.
- Confirmar P0/P1/P2 = 0.
- Atualizar `staging_real_evidence_<timestamp>.md`.
- Somente entao propor UAT controlado.

## Criterio de saida SR-01

- Artefatos de plano criados.
- DoR e DoD definidos.
- Secrets necessarios listados sem valores.
- Testes minimos antes de UAT definidos.
- Evidencias obrigatorias mapeadas.
- Bloqueios atuais documentados.
- UAT continua bloqueado.

