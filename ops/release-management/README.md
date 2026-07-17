# Metodologia de Release

Esta metodologia define o processo mínimo para preservar, validar e promover versões do Vistoria Fácil IA entre DEV, HMLG e PROD.

## Objetivo

- Registrar formalmente a versão publicada em produção.
- Separar desenvolvimento, homologação e produção.
- Exigir rastreabilidade de branch, commit, artefato e evidências por release.
- Impedir promoções sem validação, rollback planejado e custo aprovado quando aplicável.

## Regras obrigatórias

- PROD é promovida somente pela branch `main`.
- HMLG é promovida somente pela branch `hmlg`.
- Desenvolvimento ocorre em `feature/*` ou `devops/*`.
- Correções emergenciais ocorrem em `hotfix/*`.
- Nenhum deploy pode partir de worktree sujo.
- Nenhuma produção pode ocorrer sem commit identificado.
- Nenhuma produção pode ocorrer sem HMLG aprovada.
- Nenhuma migration manual não versionada pode ser aplicada.
- Nenhuma release pode ocorrer sem tag, manifesto, smoke test e rollback disponível.
- Nenhum custo recorrente novo pode ser criado sem aprovação explícita.
- O artefato publicado e o código-fonte correspondente devem ser preservados por release.

## Baseline atual

A produção atual está registrada em `current-production.json`. Commits posteriores ainda não comprovados em produção estão registrados em `unreleased-candidates.md` e só podem entrar no fluxo por avaliação seletiva.
