# SR-01 - Auth E2E Strategy

## Decisao preferencial

Usar usuario de teste staging com email/senha e gerar `storageState` no Playwright.

## Problema atual

A suite real sem `VITE_E2E_MODE=true` abre Google OAuth interativo. Esse fluxo nao e deterministico em CI e bloqueia VF-E2E-001 a VF-E2E-010 antes do fluxo principal.

## Estrategia A - email/senha + storageState

1. Criar usuario de teste no Firebase Auth staging.
2. Garantir que o usuario tenha entitlement staging valido.
3. Rodar setup Playwright que autentica com email/senha.
4. Gravar `storageState` como artifact temporario do job.
5. Reusar `storageState` na suite VF-E2E-001 a VF-E2E-010.
6. Nao commitar nem publicar `storageState`.
7. Redigir qualquer log que contenha email ou identificadores sensiveis.

### Aceite

- Login automatizado sem Google OAuth interativo.
- Suite consegue iniciar ja autenticada.
- Token/cookie nao aparece em evidencia.
- Usuario de teste nao tem permissao de producao.

## Estrategia B - custom token E2E-only

Usar apenas se email/senha nao for aceitavel.

Requisitos:

- Endpoint ou script E2E-only habilitado apenas com `SERVER_ENV=staging`.
- Protecao por `E2E_CUSTOM_TOKEN_SECRET_REF`.
- Bloqueio hard-coded para producao.
- Rate limit e logs redigidos.
- Token curto e exclusivo para usuario de teste.
- Teste negativo provando que o endpoint nao funciona sem secret.

## Regras para `VITE_E2E_MODE`

- Permitido para suite local deterministica e mocks isolados.
- Proibido como bypass para aceite staging real.
- Se usado em staging para habilitar endpoint E2E-only, o relatorio deve declarar claramente que nao e a suite de aceite real.

## Dados de seed

- Usuario teste.
- Entitlement ativo.
- Imovel minimo.
- Bucket/pasta de teste isolada.
- Prefixo E2E por run id.

## Evidencias

- Auth strategy selecionada.
- Print/log redigido do login setup.
- Confirmacao de `storageState` gerado sem publicar conteudo.
- Evidencia de que Google OAuth interativo nao foi acionado.
- Evidencia de que o usuario tem entitlement.
- Teste negativo de acesso sem entitlement.

