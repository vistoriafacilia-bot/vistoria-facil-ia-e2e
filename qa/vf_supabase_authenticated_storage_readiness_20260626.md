# VF Supabase Authenticated Storage Readiness - 2026-06-26

## Estado atual

- Base nova: Supabase Free client-side.
- Firebase, Google Cloud, Cloud Run, Cloud Build, Artifact Registry e billing nao fazem parte do fluxo ativo.
- `.env.local` existe localmente e deve permanecer nao versionado.
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` ja estao configurados localmente.
- Migration Supabase aplicada no SQL Editor com retorno `Success. No rows returned.`
- Supabase Auth endpoint acessivel.
- `public.plans` e tabelas principais acessiveis conforme RLS.
- Bucket `inspection-photos` existe.
- Upload anonimo bloqueado por RLS 403, comportamento esperado.
- UAT nao liberado.

## SQL Supabase

Arquivos consolidados:

- `supabase/migrations/202606250001_vistoria_facil_foundation.sql`
- `qa/supabase_sql_to_apply_20260626.sql`

Hash SHA-256 confirmado para ambos:

```text
80512062A2406C2BBBA0F02E740AE38A9C124BFED4FFB715A24B2E637E1D0A42
```

## Validador autenticado de Storage

Script local seguro:

```text
scripts/validate-supabase-storage-auth.mjs
```

Comando:

```text
npm run qa:supabase-storage-auth
```

O script:

- carrega `.env.local` sem imprimir valores;
- exige `SUPABASE_E2E_EMAIL` e `SUPABASE_E2E_PASSWORD`;
- usa apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`;
- nao usa chave administrativa do Supabase;
- tenta `signInWithPassword`;
- se necessario, tenta `signUp`;
- reporta `BLOCKED: email confirmation required` se o projeto exigir confirmacao de email;
- faz upload, download, delete e confirmacao de cleanup no bucket `inspection-photos`;
- retorna `PASS`, `FAIL` ou `BLOCKED`.

## Bloqueio atual

Faltam as seguintes variaveis em `.env.local`:

```text
SUPABASE_E2E_EMAIL
SUPABASE_E2E_PASSWORD
```

Nao incluir essas variaveis em arquivos versionados.

## Deploy estatico gratuito

O projeto possui configuracao Netlify Free:

```text
netlify.toml
```

Configuracao esperada:

- build: `npm run build`
- publish: `dist`
- redirect SPA: `/* -> /index.html`

Nenhum deploy foi executado.

## Caminhos pagos desabilitados do fluxo ativo

- Workflow ativo `.github/workflows/e2e.yml` executa gates, Playwright local e artefato estatico.
- Nao ha step ativo de `gcloud`, `firebase deploy`, Cloud Run, Cloud Build ou Artifact Registry.
- Scripts `e2e:staging` e `qa:staging-real` foram apontados para o validador Supabase seguro, removendo o caminho manual ativo antigo baseado em Cloud Run.
- Evidencias e planos historicos sobre Firebase/GCP permanecem como historico, mas nao sao fluxo ativo.

## Proxima acao humana minima

Adicionar localmente em `.env.local`, sem versionar:

```text
SUPABASE_E2E_EMAIL=...
SUPABASE_E2E_PASSWORD=...
```

Depois executar:

```text
npm run qa:supabase-storage-auth
```

Se passar, rodar novamente os gates locais completos antes de qualquer deploy estatico gratuito.
