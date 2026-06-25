# SR-01 - Blockers and Severity

Status atual: staging real bloqueado

UAT: nao liberado

## Bloqueios conhecidos

| ID | Severidade | Bloqueio | Impacto | Acao de desbloqueio |
| --- | --- | --- | --- | --- |
| SR01-B001 | P1 | GitHub remoto nao recebeu push por falta de credencial/token | CI remoto nao executa | Configurar PAT/SSH por canal seguro e fazer push |
| SR01-B002 | P1 | Firebase CLI sem login/service account | Deploy staging nao executa | Configurar service account/ADC em CI |
| SR01-B003 | P1 | Playwright real abre Google OAuth interativo | VF-E2E real falha 10/10 | Implementar Auth E2E email/senha + storageState ou custom token E2E-only |
| SR01-B004 | P1 | Hosting estatico sozinho nao cobre `server.ts`/`/api` | App real incompleto | Publicar backend Cloud Run e validar rewrite |
| SR01-B005 | P1 | Firestore/Storage/IA/Mercado Pago ainda nao provados em staging real | UAT sem base tecnica | Executar testes integrados reais com evidencias |
| SR01-B006 | P2 | Worktree local contem alteracoes nao commitadas | CI remoto pode divergir do local | Classificar, commitar ou excluir alteracoes antes do push |

## Classificacao de severidade

### P0

- Secret vazado.
- Producao alterada.
- Pagamento real acionado.
- Deploy em projeto errado.
- Usuario entra sem entitlement.
- Perda de dados.
- Falha silenciosa.

### P1

- CI nao roda.
- Deploy falha.
- `/api` nao responde.
- Auth E2E nao funciona.
- Firestore/Storage bloqueiam fluxo principal.
- Mercado Pago sandbox nao fecha entitlement.
- Playwright depende de OAuth interativo.

### P2

- Evidencia incompleta.
- Logs confusos.
- Teste instavel.
- Performance ruim mas contornavel.
- Worktree local nao classificado antes do push.

### P3

- Melhoria visual.
- Ajuste textual.
- Refino de relatorio.

## Criterio de bloqueio

Bloquear qualquer avanco para UAT se:

- Houver P0/P1/P2 aberto.
- Falta evidencia obrigatoria.
- Secret aparecer em log/evidencia.
- Staging real depender de OAuth interativo.
- Backend real nao estiver publicado.
- `/api/health` nao responder via Hosting e Cloud Run.
- Firestore/Storage reais nao forem provados.
- Mercado Pago sandbox nao fechar entitlement.
- Suite VF-E2E-001 a VF-E2E-010 falhar.

