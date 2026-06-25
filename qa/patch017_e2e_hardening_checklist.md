# Patch017 — E2E Hardening & QA Harness

Status: preparado localmente. Não aplicar em AI Studio antes de revisar este checklist.

## Objetivo

Endurecer o fluxo antes de UAT, sem adicionar feature de produto:

1. impedir conclusão de vistoria inconsistente;
2. impedir geração de PDF sem entitlement ativo;
3. impedir PDF com análise pendente ou dados cruzados;
4. reduzir bundle inicial com lazy-load do jsPDF;
5. aumentar cobertura unitária de gates E2E.

## Gate automatizado local

Executar:

```bash
npm run lint
npm test -- --run
npm run build
```

Critério:

- lint OK;
- testes OK;
- build OK;
- aviso de bundle permitido apenas se chunk principal reduzir em relação ao Patch016 ou ficar documentado como P1.

## Cenários E2E manuais para AI Studio/staging

### E2E-017-01 — Plano gratuito + vistoria mínima

1. Criar login novo.
2. Ativar plano gratuito.
3. Cadastrar imóvel completo.
4. Criar vistoria de entrada.
5. Adicionar 1 foto.
6. Aguardar análise IA.
7. Concluir & Revisar.
8. Gerar PDF.
9. Voltar ao histórico.
10. Abrir PDF salvo.

Esperado:

- acesso liberado sem pagamento;
- limite exibido como 10 fotos;
- conclusão bloqueada enquanto análise está pendente;
- PDF salvo e histórico mostra `pdf_gerado`.

### E2E-017-02 — Bloqueio sem fotos

1. Criar vistoria.
2. Não adicionar fotos.
3. Clicar em Concluir & Revisar.

Esperado:

- bloqueio explícito;
- não muda status para concluída;
- não entra na tela de PDF.

### E2E-017-03 — Bloqueio com análise pendente

1. Criar vistoria.
2. Adicionar foto.
3. Clicar em Concluir & Revisar antes de a análise encerrar.

Esperado:

- bloqueio por `AI_ANALYSIS_PENDING`;
- usuário permanece na vistoria.

### E2E-017-04 — Plano pago com entitlement confirmado

1. Login.
2. Escolher beta pago.
3. Confirmar pagamento em ambiente de teste/sandbox.
4. Verificar entitlement ativo.
5. Criar vistoria com mais de 10 fotos e até 50.
6. Gerar PDF.

Esperado:

- limite exibido como 50 fotos;
- acesso só libera após backend/webhook/consulta validada;
- retorno de URL sozinho não libera.

### E2E-017-05 — Tentativa de PDF sem entitlement

1. Forçar estado sem entitlement ativo.
2. Tentar abrir/gerar PDF.

Esperado:

- app bloqueia geração;
- mensagem indica ausência de plano ativo;
- nenhum PDF é salvo.

### E2E-017-06 — Histórico após PDF

1. Gerar PDF.
2. Sair da tela.
3. Voltar ao histórico do imóvel.
4. Abrir vistoria.
5. Abrir PDF salvo.

Esperado:

- vistoria permanece no histórico;
- `pdfUrl`, `reportId`, `pdfStoragePath` existem;
- PDF abre do Storage.

## Bloqueadores de UAT

- qualquer PDF gerado sem entitlement ativo;
- qualquer conclusão sem foto;
- qualquer conclusão com análise pendente;
- qualquer foto de outro usuário/cômodo/vistoria aceita como válida;
- qualquer relatório sem persistência no histórico;
- qualquer falha silenciosa sem mensagem visível.
