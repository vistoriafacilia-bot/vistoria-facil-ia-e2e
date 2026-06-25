# SR-01 - Definition of Ready

Status: ready for credential/setup phase when all required inputs are available

UAT: nao liberado

## DoR para iniciar configuracao real de staging

1. Plano SR-01 aprovado.
2. Repositorio remoto GitHub definido.
3. Metodo de autenticacao Git definido: PAT ou SSH key.
4. Branch alvo definida.
5. GitHub Actions environment `staging` criado.
6. Secrets de GitHub cadastrados por canal seguro.
7. Projeto Firebase/GCP staging confirmado.
8. Service account staging criada com permissoes minimas.
9. Firebase Hosting site staging definido.
10. Cloud Run service name e regiao definidos.
11. Auth E2E definido sem Google OAuth interativo.
12. Usuario de teste staging autorizado.
13. Estrategia de seed Firestore/Storage aprovada.
14. Mercado Pago sandbox configurado.
15. Politica de redacao de logs/evidencias aprovada.
16. Worktree local revisado: alteracoes existentes devem estar commitadas ou explicitamente excluidas.
17. Nenhum secret em arquivo versionado.
18. Nenhuma configuracao de producao selecionada.
19. Plano de rollback documentado.
20. Dono da decisao de UAT identificado, mas UAT ainda bloqueado.

## Entradas obrigatorias

- `GH_REPO_URL`
- Git remote auth method.
- Firebase/GCP project id staging.
- GCP region.
- Cloud Run service name.
- Firebase Hosting site.
- Firebase Web App config staging.
- Firebase service account reference.
- E2E Auth strategy.
- Mercado Pago sandbox credentials references.
- Staging base URL.

## Condicoes bloqueantes antes de configurar

- Token solicitado ou colado no chat.
- Secret impresso em log.
- Projeto de producao selecionado.
- Pagamento real habilitado.
- Google OAuth interativo como unica estrategia E2E.
- Backend sem rota de health.
- `firebase.json` sem rewrite `/api/**`.
- Worktree com alteracoes nao classificadas.

## Definition of Done da preparacao SR-01

- Todos os arquivos SR-01 existem.
- `sr01_manifest.json` e valido.
- Plano contempla Git remoto, CI, Firebase, Cloud Run, Auth E2E, Firestore, Storage, IA/backend e Mercado Pago sandbox.
- Evidencias planejadas cobrem todos os criterios de saida.
- Classificacao P0/P1/P2/P3 documentada.
- Proximo passo explicito: configurar credenciais por canal seguro e preparar staging real.

