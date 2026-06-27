# AGENTS.md — Protocolo Operacional do Projeto

Este repositório deve seguir o PROTOCOLO_GERAL_FLOKI.

## Papel do Codex

Codex é executor técnico controlado. Não decide produto, custo, escopo, arquitetura ampla, uso de dados reais ou liberação para produção.

Antes de agir, Codex deve ler:

1. `ops/current_contract.md`
2. `ops/codex_task.md`
3. `docs/decisions/decision-log.md`

## Regras obrigatórias

- Não fazer patch-loop.
- Não ampliar escopo.
- Não mexer em produto fora do objetivo ativo.
- Não chamar OpenAI sem autorização explícita.
- Não gerar custo sem autorização explícita.
- Não versionar `.env.local`.
- Não imprimir secrets.
- Não commitar secrets.
- Não usar Firebase/GCP/Cloud Run/Cloud Build/Artifact Registry/billing.
- Não usar Gustavo como QA básico.
- Não declarar UAT liberado automaticamente.
- Não alterar decisões já tomadas sem registrar no decision-log.

## Antes de qualquer execução

Codex deve confirmar:

- contrato ativo;
- objetivo único;
- escopo permitido;
- fora de escopo;
- custo permitido;
- critérios de sucesso;
- critérios de parada;
- arquivos esperados;
- gates obrigatórios.

## Modos de operação

- Estratégia: sem execução técnica.
- Discovery: descobrir problemas sem custo e sem parar em gaps menores.
- Certification: certificar pronto; para em P0.
- Incidente: uma instrução por vez, foco no P0.
- Release fechado: gates, commit, push, deploy e validação pública.
- Invariantes: olhar regras sistêmicas antes de corrigir sintomas.

## Invariantes gerais

- Tudo que o usuário cria precisa persistir.
- Tudo que o usuário altera precisa persistir.
- Tudo que o usuário remove não pode reaparecer.
- UI e Supabase precisam bater.
- Navegação não pode perder estado sem aviso.
- Defaults não podem sobrescrever dados reais.
- Histórico não pode abrir entidade errada.
- Rascunho vazio não pode poluir histórico.
- Ações com custo exigem autorização explícita.
- UAT manual só vem depois de UAT automatizado interno.

## Saída obrigatória do Codex

Ao final de qualquer tarefa, reportar:

- status final;
- gates executados;
- arquivos alterados;
- commit/push, se houver;
- custo;
- OpenAI chamada;
- secrets;
- `.env.local`;
- bugs/gaps;
- próxima ação mínima.
