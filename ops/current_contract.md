# Contrato Ativo — Vistoria Fácil IA

## Modo atual

INCIDENTE P0 / INVARIANTES FUNCIONAIS

## Objetivo único atual

Garantir persistência real, navegação confiável, ciclo de vida correto de vistoria, histórico e rascunho antes de avançar para IA, relatório, pricing ou produção.

## Bloqueios ativos

- Não chamar OpenAI.
- Não rodar IA.
- Não rodar UAT amplo.
- Não mexer em pricing.
- Não mexer em relatório.
- Não declarar produção assistida.
- Não liberar UAT manual sem UAT automatizado interno.
- Não versionar `.env.local`.
- Não imprimir secrets.

## Custo permitido

R$ 0,00.

## Invariantes críticos

1. Tudo que o usuário cria precisa persistir.
2. Tudo que o usuário altera precisa persistir.
3. Tudo que o usuário remove não pode reaparecer.
4. UI e Supabase precisam bater.
5. Navegação, voltar, reload e logout/login não podem perder estado.
6. Histórico precisa abrir a entidade correta por ID.
7. Rascunho vazio/default-only não pode poluir histórico.
8. Defaults não podem sobrescrever dados reais.
9. Usuário não pode acreditar que algo foi salvo se não foi.
10. Gustavo não deve ser usado como QA básico.

## Critério de sucesso atual

Antes de qualquer novo UAT manual, deve existir gate automatizado que prove, via UI real:

- criar imóvel;
- criar vistoria;
- criar/editar/deletar cômodos;
- sair/voltar;
- reload;
- logout/login;
- reabrir;
- UI e Supabase batem;
- cleanup PASS;
- OpenAI 0;
- custo R$ 0,00.

## Critério de parada

Parar se:

- qualquer alteração visual sumir;
- Supabase divergir da UI;
- rascunho vazio aparecer;
- entidade errada for aberta;
- gate não reproduzir fluxo real;
- OpenAI for chamada;
- secret aparecer;
- `.env.local` for staged;
- escopo for ampliado sem autorização.
