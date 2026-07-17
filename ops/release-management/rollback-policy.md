# Política de Rollback

## Frontend e funções Netlify

- Priorizar restauração de deploy anterior conhecido e validado.
- Confirmar o commit e o artefato antes de restaurar qualquer versão.
- Executar smoke test após restauração.

## Restauração de deploy anterior

- Registrar deploy atual, deploy restaurado, commit, horário e responsável.
- Preservar evidências antes e depois da restauração.
- Verificar se a versão restaurada é compatível com dados já gravados.

## Rollback de código

- Reverter código por novo commit rastreável, não por alteração manual não versionada.
- Evitar incorporar automaticamente commits não publicados.
- Hotfix deve partir do commit atual de PROD quando a correção for emergencial.

## Migrations e dados

- Não prometer rollback automático de banco quando houver risco de perda de dados.
- Usar compensação documentada quando reversão direta não preservar dados.
- Bloquear operações destrutivas sem aprovação explícita, backup aplicável e plano de recuperação.

## Incidente

Declarar incidente quando houver indisponibilidade, falha em fluxo crítico, divergência entre commit e deploy, impacto em pagamento, autenticação, vistoria, laudo, PDF ou dados reais.

## Registro

Toda decisão de rollback, compensação ou não reversão deve registrar evidências, motivo, impacto, horário, commit, ambiente e próximos passos.
