# Runbook AI Studio/Staging — Vistoria Fácil IA V0.4.0-rc2

Status: obrigatório antes de qualquer aplicação no Google AI Studio, staging ou UAT.
Objetivo: aplicar o pacote do app com risco controlado, preservar limite/crédito do AI Studio e gerar evidência objetiva de que o app está pronto para UAT.

## 0. Regra operacional

AI Studio não será usado para pensar, explorar hipótese ou fazer patch-loop.

AI Studio só pode ser aberto para:

1. aplicar pacote já consolidado localmente;
2. configurar variáveis necessárias;
3. validar o fluxo real em staging;
4. exportar evidências;
5. decidir RC aprovado, bloqueado ou rollback.

Se surgir erro não previsto, parar, registrar evidência e voltar para diagnóstico local. Não corrigir por tentativa dentro do AI Studio.

## 1. Fontes oficiais do release candidate

A versão-alvo é `V0.4.0-rc2`.

Fonte local esperada:

- `vistoria_patch019_RCReadiness_QAEvidence_source.zip` ou pacote posterior validado localmente.
- This runbook is part of Patch020.

Comandos locais obrigatórios antes de abrir AI Studio:

```bash
npm run lint
npm run test:ci
npm run build
npm run qa:rc
npm run qa:staging
npm run qa:performance
```

Critério: todos devem retornar OK/PASSED.

## 2. Pré-condições obrigatórias

Não abrir AI Studio sem os itens abaixo:

| ID | Pré-condição | Obrigatório | Evidência |
|---|---|---:|---|
| PRE-01 | ZIP fonte do RC salvo localmente | Sim | nome do arquivo e pasta |
| PRE-02 | Diff/notas dos patches 013–020 disponíveis | Sim | links/arquivos locais |
| PRE-03 | `npm run lint` OK | Sim | print/log |
| PRE-04 | `npm run test:ci` OK | Sim | print/log com total de testes |
| PRE-05 | `npm run build` OK | Sim | print/log |
| PRE-06 | `npm run qa:rc` OK | Sim | RELEASE GATE PASSED |
| PRE-07 | `npm run qa:staging
npm run qa:performance` OK | Sim | STAGING READINESS PASSED |
| PRE-08 | `.env.example` revisado | Sim | variáveis conferidas |
| PRE-09 | Firestore rules e Storage rules presentes | Sim | arquivos no pacote |
| PRE-10 | Conta/ambiente Mercado Pago sandbox definido | Sim | token sandbox e usuário teste |
| PRE-11 | URL pública de staging planejada para webhook | Sim | URL prevista |
| PRE-12 | Critério de rollback claro | Sim | seção 11 deste runbook |
| PRE-13 | Tempo reservado para teste completo | Sim | mínimo 45–60 min |
| PRE-14 | Não haverá lançamento público durante RC | Sim | confirmado |

## 3. Backup antes de aplicar

Antes de qualquer alteração no AI Studio:

1. Exportar o estado atual do projeto.
2. Salvar o ZIP como `vf_backup_before_patch020_<YYYYMMDD-HHMM>.zip`.
3. Registrar versão/horário do backup na evidência.
4. Confirmar que o backup abre/descompacta.
5. Não aplicar patch se não houver backup válido.

Critério de bloqueio: sem backup válido, não aplicar.

## 4. Aplicação controlada no AI Studio

Sequência obrigatória:

1. Abrir AI Studio.
2. Confirmar que o limite diário está disponível.
3. Criar ou selecionar ambiente de staging/cópia, nunca produção direta.
4. Importar/aplicar fonte do RC.
5. Conferir arquivos críticos:
   - `src/App.tsx`
   - `src/components/PlanGate.tsx`
   - `src/components/InspectionWizard.tsx`
   - `src/components/ReportPdfGenerator.tsx`
   - `src/lib/entitlements.ts`
   - `src/lib/paymentGuards.ts`
   - `src/lib/reporting.ts`
   - `server.ts`
   - `firestore.rules`
   - `storage.rules`
   - `.env.example`
6. Configurar variáveis de ambiente no staging.
7. Não ativar publicação/produção.
8. Rodar build/teste disponível no AI Studio, se houver.
9. Se o AI Studio falhar por limite, parar e não insistir.

## 5. Variáveis mínimas de staging

| Variável | Obrigatória | Observação |
|---|---|---|
| `GEMINI_API_KEY` | Sim | usar chave de teste/ambiente controlado |
| `APP_URL` | Sim | URL pública do staging |
| `MERCADOPAGO_ACCESS_TOKEN` | Sim | sandbox no RC |
| `FIREBASE_API_KEY` | Sim | Firebase web config |
| `FIREBASE_AUTH_DOMAIN` | Sim | Firebase web config |
| `FIREBASE_PROJECT_ID` | Sim | projeto correto |
| `FIREBASE_STORAGE_BUCKET` | Sim | bucket correto |
| `FIREBASE_MESSAGING_SENDER_ID` | Sim | Firebase web config |
| `FIREBASE_APP_ID` | Sim | Firebase web config |
| `FIRESTORE_DATABASE_ID` | Recomendado | default se não usado explicitamente |

Bloqueio: não usar token de produção Mercado Pago no primeiro teste de staging.

## 6. Firebase staging

### 6.1 Auth

Validar:

- login Google habilitado;
- usuário novo consegue entrar;
- usuário deslogado não acessa dados;
- logout limpa estado visual sensível.

### 6.2 Firestore

Publicar/revisar `firestore.rules`.

Validar coleções esperadas:

- `users`
- `properties`
- `inspections`
- `rooms`
- `photos`
- `orders`
- `payments`
- `entitlements`
- `webhook_events`
- `reports`

Bloqueio: client não pode criar pagamento aprovado nem entitlement pago.

### 6.3 Storage

Publicar/revisar `storage.rules`.

Validar paths:

- fotos vinculadas ao dono/autenticação;
- relatórios em PDF por `userId/propertyId/inspectionId`;
- download permitido apenas ao dono.

## 7. Mercado Pago sandbox

### 7.1 Fluxo esperado

1. App cria pedido interno.
2. Backend cria preferência de pagamento.
3. Usuário é redirecionado para checkout sandbox.
4. Pagamento retorna para o app.
5. App mostra status aguardando confirmação.
6. Webhook ou consulta backend confirma pagamento.
7. Backend valida ordem, usuário, plano, valor, moeda e status.
8. Backend cria/atualiza payment.
9. Backend cria entitlement.
10. App libera uso pago.

### 7.2 Regras de segurança

- retorno de URL não libera entitlement;
- pagamento pendente não libera;
- pagamento recusado não libera;
- valor divergente não libera;
- moeda divergente não libera;
- plano divergente não libera;
- usuário divergente não libera;
- webhook duplicado não duplica entitlement;
- erro de webhook fica registrado.

## 8. E2E staging obrigatório

Executar em ordem. Não pular etapas.

### STG-E2E-01 — Login e plano gratuito

1. Criar/login usuário A.
2. Ativar plano gratuito.
3. Confirmar limite de 10 fotos.
4. Confirmar que não existe entitlement pago.
5. Tentar ultrapassar limite.
6. Resultado esperado: bloqueio compreensível.

### STG-E2E-02 — Plano pago via checkout sandbox

1. Criar/login usuário B.
2. Escolher plano pago beta R$ 49,90.
3. Abrir checkout Mercado Pago sandbox.
4. Simular pagamento aprovado.
5. Voltar ao app.
6. Confirmar que a tela não libera só pelo retorno.
7. Aguardar confirmação webhook/consulta.
8. Confirmar entitlement ativo.
9. Confirmar limite de 50 fotos.

### STG-E2E-03 — Imóvel, vistoria, cômodos e fotos

1. Usuário com entitlement ativo cadastra imóvel.
2. Confirma persistência após reload.
3. Cria vistoria.
4. Adiciona cômodos.
5. Adiciona fotos por cômodo.
6. Recarrega o app.
7. Confirma que cômodos e fotos persistem no lugar correto.

### STG-E2E-04 — Gate de qualidade

1. Tentar concluir vistoria sem fotos.
2. Esperado: bloqueio.
3. Tentar concluir com análise pendente.
4. Esperado: bloqueio.
5. Concluir com fotos válidas/análise/fallback concluído.
6. Esperado: permitido.

### STG-E2E-05 — PDF persistente

1. Gerar relatório PDF.
2. Confirmar upload no Storage.
3. Confirmar metadata em Firestore.
4. Confirmar `pdfUrl`/`reportId` na vistoria.
5. Reabrir histórico.
6. Abrir PDF salvo.
7. Confirmar que o PDF é da mesma vistoria.

### STG-E2E-06 — Isolamento multiusuário

1. Usuário A não vê imóvel do usuário B.
2. Usuário A não vê vistoria do usuário B.
3. Usuário A não abre PDF do usuário B.
4. Usuário sem entitlement não gera PDF pago.

### STG-E2E-07 — Pagamento negativo

1. Simular pagamento pendente.
2. Esperado: não libera.
3. Simular pagamento recusado/cancelado.
4. Esperado: não libera.
5. Simular webhook duplicado aprovado.
6. Esperado: não duplica entitlement.

## 9. Evidências obrigatórias

Preencher `qa/staging_evidence_template_v0_4.md` com:

- data/hora;
- versão;
- ambiente;
- URL staging;
- comandos locais;
- backup;
- variáveis configuradas sem expor segredo;
- resultado por cenário;
- prints/logs relevantes;
- defeitos abertos;
- decisão final.

## 10. Critério de Release Candidate aprovado

RC staging aprovado somente se:

- 100% dos comandos locais OK;
- backup válido existente;
- Firestore rules publicadas/revisadas;
- Storage rules publicadas/revisadas;
- Mercado Pago sandbox validado;
- entitlement pago liberado somente após confirmação validada;
- plano gratuito funciona e limita 10 fotos;
- plano pago funciona e limita 50 fotos;
- imóvel/vistoria/cômodos/fotos persistem após reload;
- PDF é salvo e reaberto pelo histórico;
- usuário A não acessa dados do usuário B;
- 0 P0/P1 aberto.

## 11. Rollback

Executar rollback se qualquer item ocorrer:

- app não builda no AI Studio;
- login real quebra;
- regras bloqueiam uso legítimo;
- usuário consegue entitlement pago sem pagamento aprovado;
- pagamento aprovado não libera mesmo após webhook válido;
- PDF não persiste;
- histórico continua vazio;
- dados entre usuários vazam;
- erro consome limite sem avanço claro.

Plano de rollback:

1. Parar testes.
2. Registrar evidência.
3. Restaurar backup exportado antes da aplicação.
4. Confirmar app volta ao estado anterior.
5. Voltar para diagnóstico local.
6. Não tentar patch improvisado no AI Studio.

## 12. Decisão pós-staging

Após execução:

- **PASS:** gerar pacote RC para UAT.
- **BLOCKED:** registrar defeitos e preparar patch local novo.
- **ROLLBACK:** restaurar backup e congelar.

UAT só entra após PASS.


## Patch021 — Gate de Performance

Antes de abrir AI Studio, executar `npm run build` e `npm run qa:performance`. Se falhar, bloquear aplicação em staging até reduzir o bundle ou revisar orçamento com justificativa explícita.
