# VF-SUPABASE-FREE-FOUNDATION-001

Data: 2026-06-25
Status: BLOCKED para validacao real externa; fundacao local implementada e validada.
UAT: nao liberado.

## Decisao operacional

Gustavo escolheu custo zero. A nova fundacao nao usa Firebase como base, Google Cloud, Cloud Run, Cloud Build, Artifact Registry ou billing.

## Substituicoes implementadas

- Auth: Supabase Auth por `src/lib/services/authService.ts`.
- Database: Supabase Postgres/RLS por services de properties, inspections, rooms, photos, reports, entitlements e events.
- Storage: Supabase Storage bucket `inspection-photos` por `src/lib/services/storageService.ts`.
- E2E local: store deterministica em `src/lib/supabaseLocalStore.ts`.
- Deploy: build estatico Vite, workflow sem `gcloud` e sem `firebase deploy`, config `netlify.toml`.

## Escopo permitido no zero-cost

- Login Email/Password via Supabase Auth quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` reais forem configurados.
- Cadastro/listagem/edicao/exclusao de imoveis.
- Criacao/listagem/edicao de vistorias.
- Criacao/listagem/edicao/exclusao de comodos.
- Upload/leitura/cleanup de fotos no Supabase Storage.
- Persistencia de dados no Postgres com RLS por usuario.
- Geracao de PDF client-side e upload do PDF no bucket.
- Plano gratuito com limite de 10 fotos por vistoria.

## Escopo excluido do UAT zero-cost

- Backend `/api`.
- `server.ts` como runtime de producao.
- Cloud Run, Cloud Build, Artifact Registry.
- Gemini server-side.
- Mercado Pago checkout/webhook/liberacao automatica paga.
- Firebase Hosting/Auth/Firestore/Storage como base operacional.

## Decisoes de produto pendentes

- O que fazer com plano pago `beta_paid_4990` sem backend/webhook.
- Se IA server-side sera removida, substituida por analise local/manual ou retomada em arquitetura paga.
- Plataforma free final de deploy: Netlify Free ou Vercel Free.

## Evidencias locais

- `npm run lint`: PASS em 2026-06-26 07:14 BRT.
- `npm run test:ci`: PASS, 14 arquivos, 56 testes, 6 testes legados Firebase skipped.
- `npm run build`: PASS.
- `npm run qa:performance`: PASS.
- `npm run e2e:local`: PASS, 13/13 testes Playwright.
- `npm run qa:staging`: PASS.
- `npm run qa:rc`: PASS.

## Bloqueios

- `npm run test:ci` e `npm run e2e:local` exigem spawn escalado de Vite/esbuild/Playwright neste ambiente; foram reexecutados com sucesso apos a liberacao do limite de uso.
- Validacao contra Supabase real exige `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do projeto `vistoria-facil-ia-v0`.
- Deploy estatico gratuito exige acesso/token/site Netlify ou Vercel. Nenhum deploy foi executado.

## Divergencias mocks vs real

- E2E local usa localStorage deterministico; Supabase real depende de RLS, Auth session e Storage signed URLs.
- IA server-side em mock/local aplica fallback manual; real zero-cost nao chama Gemini.
- Plano pago permanece visivel como produto, mas indisponivel no escopo zero-cost.
- Cleanup real de Storage/DB ainda precisa ser validado apos aplicar migration e configurar credenciais publicas.
