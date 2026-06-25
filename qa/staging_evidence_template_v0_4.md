# Evidência de Staging — Vistoria Fácil IA V0.4.0-rc2

Preencher durante a aplicação no AI Studio/Staging.

## 1. Identificação

| Campo | Valor |
|---|---|
| Data/hora |  |
| Responsável técnico |  |
| Versão | V0.4.0-rc2 |
| Patch aplicado | Patch020 ou posterior |
| Ambiente | AI Studio/Staging |
| URL do ambiente |  |
| Backup pré-aplicação |  |
| Fonte aplicada |  |

## 2. Gates locais antes do AI Studio

| Comando | Resultado | Evidência |
|---|---|---|
| `npm run lint` |  |  |
| `npm run test:ci` |  |  |
| `npm run build` |  |  |
| `npm run qa:rc` |  |  |
| `npm run qa:staging` |  |  |
| `npm run qa:performance` |  |  |

## 3. Configuração sem segredos

Não colar tokens ou chaves reais. Registrar apenas se existe/foi configurado.

| Item | OK? | Observação |
|---|---|---|
| Gemini API key configurada |  |  |
| Firebase Auth configurado |  |  |
| Firestore rules publicadas/revisadas |  |  |
| Storage rules publicadas/revisadas |  |  |
| Mercado Pago sandbox token configurado |  |  |
| APP_URL pública configurada |  |  |
| Webhook Mercado Pago configurado |  |  |

## 4. Resultado dos cenários staging

| ID | Cenário | Resultado | Evidência | Defeito |
|---|---|---|---|---|
| STG-E2E-01 | Login e plano gratuito |  |  |  |
| STG-E2E-02 | Plano pago via checkout sandbox |  |  |  |
| STG-E2E-03 | Imóvel/vistoria/cômodos/fotos |  |  |  |
| STG-E2E-04 | Gate de qualidade |  |  |  |
| STG-E2E-05 | PDF persistente |  |  |  |
| STG-E2E-06 | Isolamento multiusuário |  |  |  |
| STG-E2E-07 | Pagamento negativo |  |  |  |

## 5. Defeitos abertos

| ID | Severidade | Descrição | Bloqueia UAT? | Evidência |
|---|---|---|---|---|
|  |  |  |  |  |

Se houver P0/P1, UAT bloqueado.

## 6. Decisão final

Marcar uma opção:

- [ ] PASS — liberar pacote RC para UAT.
- [ ] BLOCKED — preparar correção local.
- [ ] ROLLBACK — restaurar backup.

Justificativa:
