# Vistoria Fácil IA

Aplicativo inteligente para vistoria de imóveis integrada com inteligência artificial para análise de imagens.

## Inicialização rápida

1. Instale as dependências:
   `npm install`
2. Configure a variável `GEMINI_API_KEY` em [.env.local](.env.local) ou use o painel do AI Studio.
3. Inicie o app:
   `npm run dev`

## Patch016 — PDF persistente em Storage

Este pacote inclui persistência do relatório PDF em Firebase Storage e metadados do relatório em `inspections/{inspectionId}/reports/{reportId}`.

Arquivos novos/alterados relevantes:
- `src/lib/reporting.ts`
- `src/__tests__/reporting.test.ts`
- `src/components/ReportPdfGenerator.tsx`
- `src/types.ts`
- `storage.rules`

A regra `storage.rules` precisa ser publicada no Firebase antes do UAT de PDF persistente.

## Patch020 — AI Studio/Staging Runbook

Este pacote inclui a camada operacional de aplicação controlada no AI Studio/Staging.

Comandos obrigatórios antes de abrir AI Studio:

```bash
npm run lint
npm run test:ci
npm run build
npm run qa:rc
npm run qa:staging
```

Documentos operacionais:

- `qa/aistudio_staging_runbook_v0_4.md`
- `qa/ai_studio_apply_checklist_v0_4.md`
- `qa/staging_evidence_template_v0_4.md`

Regra: AI Studio só deve ser usado para aplicação/validação final com backup, rollback e evidência. Não usar para exploração ou patch-loop.

## Patch021 — Performance Budget e Split de Bundle

Este pacote inclui orçamento de performance local para reduzir risco de bundle inicial pesado antes do AI Studio/Staging.

Comando adicional após build:

```bash
npm run qa:performance
```

Documento operacional:

- `qa/performance_budget_v0_4.md`

Critérios: chunk principal <= 650 KB, maior chunk <= 900 KB e chunks manuais de vendor presentes.

Patch021 também estabiliza `test:ci` usando reporter verbose e pool forks para reduzir risco de timeout/hang em execução encadeada de QA.
