# VF UAT Mass Control - 2026-06-26

Status: PASS

URL testada: https://glittery-boba-2b3367.netlify.app
Run ID: uat_mass_1782490068945
Inicio: 2026-06-26T16:07:48.945Z
Fim: 2026-06-26T16:15:50.101Z

## Planos detectados

| Plano | Nome | Limite de fotos | PDF | Pagamento |
|---|---:|---:|---:|---:|
| `free_10` | Gratuito | 10 | sim | nao |
| `beta_paid_4990` | Beta Pago | 50 | sim | sim |

## Totais

- Clientes solicitados: 10
- Clientes executados: 10
- Fotos persistidas durante a rodada: 68
- Cleanup total: sim
- Forgot password: NOT_SUPPORTED na UI atual
- Reenviar e-mail/convite: NOT_SUPPORTED na UI atual

## Matriz por cliente

| Plano | Cliente | Status | Senha errada | Login | Esqueci senha | Reenviar email | CRUD | Limites | Storage | Persistencia | Cleanup | Erro |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|
| free_10 | 1 | PASS | PASS | PASS | NOT_SUPPORTED | NOT_SUPPORTED | PASS | PASS | PASS | PASS | PASS |  |
| free_10 | 2 | PASS | PASS | PASS | NOT_SUPPORTED | NOT_SUPPORTED | PASS | PASS | PASS | PASS | PASS |  |
| free_10 | 3 | PASS | PASS | PASS | NOT_SUPPORTED | NOT_SUPPORTED | PASS | PASS | PASS | PASS | PASS |  |
| free_10 | 4 | PASS | PASS | PASS | NOT_SUPPORTED | NOT_SUPPORTED | PASS | PASS | PASS | PASS | PASS |  |
| free_10 | 5 | PASS | PASS | PASS | NOT_SUPPORTED | NOT_SUPPORTED | PASS | PASS | PASS | PASS | PASS |  |
| beta_paid_4990 | 1 | PASS | PASS | PASS | NOT_SUPPORTED | NOT_SUPPORTED | PASS | PASS | PASS | PASS | PASS |  |
| beta_paid_4990 | 2 | PASS | PASS | PASS | NOT_SUPPORTED | NOT_SUPPORTED | PASS | PASS | PASS | PASS | PASS |  |
| beta_paid_4990 | 3 | PASS | PASS | PASS | NOT_SUPPORTED | NOT_SUPPORTED | PASS | PASS | PASS | PASS | PASS |  |
| beta_paid_4990 | 4 | PASS | PASS | PASS | NOT_SUPPORTED | NOT_SUPPORTED | PASS | PASS | PASS | PASS | PASS |  |
| beta_paid_4990 | 5 | PASS | PASS | PASS | NOT_SUPPORTED | NOT_SUPPORTED | PASS | PASS | PASS | PASS | PASS |  |

## Limites por plano

### free_10

- Limite real: 10
- Abaixo do limite: PASS
- No limite: PASS
- Acima do limite: PASS
- Fotos efetivamente persistidas no representante: 10
- Cap tecnico aplicado: nao

### beta_paid_4990

- Limite real: 50
- Abaixo do limite: PASS
- No limite: PASS
- Acima do limite: PASS
- Fotos efetivamente persistidas no representante: 50
- Cap tecnico aplicado: nao


## Erros de runtime

- Console errors sanitizados: 98
- Page errors: 0
- Failed requests: 0

## Blockers

- Nenhum blocker remanescente da rodada automatizada.

## Decisao

A rodada massiva automatizada passou e pode apoiar o inicio de UAT manual controlado. UAT nao foi liberado automaticamente.
