# Vistoria Fácil IA — Plano UAT Manual RC — Itens 1, 2 e 3 aprovados

**Status:** documento consolidado de governança para desbloquear o Comando 0 / preparação do Item 4 no Codex.

**Regra de uso:** este arquivo deve existir na worktree limpa baseada em `origin/main` antes de qualquer execução do Item 4. Codex deve lê-lo junto com `AGENTS.md`, `ops/current_contract.md`, `ops/codex_task.md`, `ops/codex_result_template.md` e `docs/decisions/decision-log.md`.

**Hierarquia aplicável:**
1. Documentos de governança do projeto.
2. Item 1 aprovado.
3. Item 2 aprovado.
4. Item 3 aprovado.
5. Instrução operacional do Item 4.
6. Implementação técnica existente.

**Status obrigatório em caso de conflito:** `BLOCKED_CONTRACT_CONFLICT`.

**Status obrigatório se este arquivo ou qualquer documento obrigatório estiver ausente:** `BLOCKED_CONTRACT_MISSING`.

---

## Decisões aplicáveis ao Item 4

- Codex é executor técnico controlado; não decide produto, release, escopo, custo, segurança ou avanço de fase.
- Item 4 é execução automatizada completa; não é correção de produto, commit, push, deploy ou UAT.
- Para cada entidade funcional, validar CRUD completo quando aplicável.
- Ausência de Delete na UI vira `GAP_PRODUCT_DECISION`, nunca `PASS`.
- Depois de cada ação funcional relevante, aplicar checkpoint: sair/reabrir → reload → reabrir → logout-login → reabrir novamente → validar UI → validar Supabase/Storage → validar vínculos → só então avançar.
- IA controlada: até 3 fotos, máximo 3 chamadas OpenAI, sem reanálise automática, custo máximo R$ 0,45 base / R$ 0,75 stress.
- P0 funcional para a execução e direciona tratamento ao Item 5; Codex não corrige produto no Item 4.
- Sem `.env.local`, sem impressão de secrets, sem pasta antiga suja, sem scope drift.

---

## Item 1 — Conteúdo aprovado

### Item 1 — Plano Mestre de Liberação UAT Hoje

Estas são as respostas fechadas para o item 1.

**Pergunta**

**Resposta**

Qual é o objetivo de hoje?

Liberar UAT Manual hoje para o Vistoria Fácil IA.

O que vamos liberar?

Uma Release Candidate funcional da jornada principal. Não é produto comercial final, beta comercial ou versão com todos os refinamentos possíveis.

Qual é a jornada principal?

A jornada principal será incremental, com validação de persistência em cada etapa: login/sessão → criar imóvel → sair/reload/logout-login/reabrir/confirmar → editar imóvel → sair/reload/logout-login/reabrir/confirmar → criar vistoria → sair/reload/logout-login/reabrir/confirmar → validar histórico/rascunho → sair/reload/logout-login/reabrir/confirmar → CRUD completo de cômodos → sair/reload/logout-login/reabrir/confirmar → CRUD completo de fotos → sair/reload/logout-login/reabrir/confirmar → privacy guard → sair/reload/logout-login/reabrir/confirmar → IA controlada → sair/reload/logout-login/reabrir/confirmar → revisão humana → sair/reload/logout-login/reabrir/confirmar → relatório/PDF → sair/reload/logout-login/reabrir/confirmar → retomada pelo histórico → cleanup.

Como a jornada será testada?

Primeiro com persistência incremental obrigatória em cada etapa: faz uma ação → sai/reload/logout-login → reabre → confirma persistência → só então avança. Depois, roda o caminho feliz completo do início ao fim.

Qual é o papel do pré-UAT automatizado?

Simular o usuário real antes de você testar, cobrindo regressão funcional completa do escopo aprovado, incluindo persistência incremental em cada etapa, caminho feliz completo, IA controlada, relatório, cleanup e validação pública.

Qual é o papel do Gustavo no UAT?

Gustavo atua como Product Owner e aprovador final de aceite. Ele valida produto, experiência, clareza, confiança, fluxo e valor percebido. Gustavo não deve atuar como QA básico, não deve descobrir bugs primários de persistência, navegação, histórico, IA, relatório, dados inconsistentes ou falhas que deveriam ter sido capturadas pela regressão automatizada.

Qual é o papel do Floki?

Floki exerce os papéis definidos na matriz RACI: Tech Lead, QA Lead, DevOps Lead, Arquiteto Funcional, Product QA, Guardião de Invariantes, Guardião de Escopo, Guardião de Custo, Guardião de Segurança e Release Manager da RC. Floki é responsável por transformar o objetivo de negócio em matriz funcional testável, definir critérios de aceite, bloquear desvios, controlar riscos, orientar Codex, avaliar evidências, classificar P0/P1/P2, decidir se a RC pode avançar de fase e proteger Gustavo de receber bug básico em UAT.

Qual é o papel do Codex?

Codex é executor técnico controlado. É responsável por implementar gates, executar testes, corrigir P0s autorizados, gerar evidências, rodar regressão e preparar commit/push/deploy somente quando os critérios forem cumpridos. Codex não decide produto, não decide liberação de UAT, não amplia escopo, não altera decisões congeladas, não assume custo novo e não passa por cima do contrato ativo.

O que Floki não pode fazer?

Mandar Codex antes da matriz aprovada, mudar o plano no meio, aceitar PASS falso, liberar Gustavo com P0 conhecido, corrigir por sensação, pular regressão completa, tratar bug básico como UAT, ignorar invariantes funcionais ou terceirizar decisão de aceite para Codex.

O que Codex não pode fazer?

Decidir produto, ampliar escopo, mexer em pricing/pagamento, chamar IA acima do limite, imprimir secrets, versionar .env.local, fazer push com gate falhando, alterar decisões congeladas ou declarar UAT liberado sozinho.

O que entra no escopo hoje?

Login/sessão, imóvel, vistoria, histórico/rascunho, CRUD completo de cômodos, CRUD completo de fotos, privacy guard, IA controlada, revisão humana, relatório/PDF, persistência incremental etapa a etapa, caminho feliz completo, reload/logout-login em todas as etapas, retomada, cleanup e validação UI x Supabase/Storage.

O que fica fora hoje?

Pagamento, assinatura, pricing final, planos pagos, beta comercial, growth, automação social, polimento visual fino, IA em lote grande, todas as variações possíveis de imóvel e todas as exceções possíveis de relatório.

IA entra?

Sim. IA controlada é obrigatória no pré-UAT automatizado.

Limite de IA autorizado?

Até 3 fotos, máximo 3 chamadas OpenAI, sem reanálise automática.

Custo IA autorizado?

Total máximo: R$ 0,45 base / R$ 0,75 stress.

Regressão esperada?

Regressão completa do escopo funcional principal, não mínima. Deve cobrir persistência incremental em cada etapa + caminho feliz completo + regressão pública.

Critério para liberar UAT Manual?

Persistência incremental em todas as etapas PASS + caminho feliz completo PASS + lint PASS + build PASS + IA controlada PASS + custo dentro do limite + relatório/PDF PASS + cleanup PASS + deploy público PASS + regressão pública PASS + sem P0 aberto.

Critério de bloqueio?

Qualquer P0 funcional, perda de dados, UI diferente do Supabase, histórico abrindo entidade errada, rascunho lixo, cômodo/foto/IA/revisão/relatório inconsistente, falha de persistência após sair/reload/logout-login, risco de secret, .env.local staged, custo acima do limite, cleanup falho ou deploy público não validado.

Fonte de verdade técnica?

origin/main + worktree limpa. A pasta antiga suja fica em quarentena.

Quando Codex entra?

Só depois da Matriz Funcional Pré-UAT aprovada.

Status final possível?

PASS_RC_PUBLIC, PASS_RC_LOCAL_ONLY, FAIL_CORE, BLOCKED_ENV, BLOCKED_SECURITY, BLOCKED_COST, BLOCKED_P0_SYSTEMIC.

Regra central do item 1

Gustavo só recebe o app se a Release Candidate passar por pré-UAT automatizado completo local e público, incluindo persistência etapa a etapa com sair/reload/logout-login em todas as etapas, IA controlada, relatório/PDF e cleanup, sem P0 aberto.


## Item 2 — Conteúdo aprovado

### Item 2 — Matriz Funcional Pré-UAT

Estas são as respostas fechadas para o item 2.

**Pergunta**

**Resposta**

Qual é o objetivo do Item 2?

Definir a Matriz Funcional Pré-UAT que será usada para orientar os gates automatizados antes do UAT Manual. A matriz transforma a jornada principal aprovada no Item 1 em itens funcionais testáveis, com ações, resultados esperados, validações obrigatórias, evidências e critérios de bloqueio.

Qual é a regra-mãe do Item 2?

O pré-UAT deve validar CRUD completo de todas as entidades funcionais do escopo, com persistência em todos os níveis funcionais. Depois de cada criação, leitura, alteração ou exclusão, o teste precisa sair, recarregar, fazer logout-login, reabrir e confirmar que os dados persistiram corretamente.

O que significa CRUD completo?

Para cada entidade funcional do escopo, o teste deve validar: Create — criar; Read — listar, consultar, selecionar ou reabrir; Update — editar, alterar status ou revisar; Delete — excluir, remover, cancelar, descartar ou limpar quando aplicável. Ausência de Delete na UI não vira PASS: vira GAP_PRODUCT_DECISION.

O que significa persistência em todos os níveis funcionais?

Significa validar persistência em cada camada do fluxo: UI, Supabase, Storage quando houver arquivo, vínculo entre entidades, histórico, retomada, relatório e estado após sair/reload/logout-login. Não basta validar no final; cada etapa precisa provar que o dado permanece antes de avançar.

Qual é a sequência obrigatória após cada ação funcional?

Executar ação → sair da tela ou voltar → reabrir → dar reload → fazer logout-login → reabrir novamente → validar UI → validar Supabase/Storage → confirmar vínculo correto → só então avançar para a próxima ação.

Quais entidades precisam ter CRUD completo testado?

Imóvel, vistoria, cômodos, fotos/arquivos, análises/sugestões IA, revisões humanas, relatório/PDF e registros auxiliares gerados pelo fluxo. Histórico/rascunho, sessão e privacy guard precisam ter ciclo funcional completo validado, mesmo não sendo CRUD clássico.

Como tratar entidades que não são CRUD clássico?

Sessão, histórico/rascunho e privacy guard devem ter ciclo funcional equivalente: iniciar, consultar/retomar, alterar estado quando aplicável, sair/reload/logout-login, reabrir e confirmar comportamento correto. Se houver ação de descartar/cancelar/remover, ela deve ser testada.

Como tratar entidade sem Delete disponível na UI?

Se a entidade está no escopo funcional e não existe ação de delete/cancelamento/remoção na UI, o gate deve registrar GAP_PRODUCT_DECISION. Não pode marcar PASS falso. Gustavo decide se o gap bloqueia o UAT de hoje.

Como tratar entidade com Delete disponível na UI?

Se existe botão ou ação de delete, a exclusão precisa ser testada obrigatoriamente. O teste deve provar que a entidade some da UI, some ou é marcada corretamente na fonte oficial, não reaparece após sair/reload/logout-login e não deixa dados órfãos.

O que a Matriz Funcional Pré-UAT precisa garantir?

Garantir que o app seja testado como produto real, não como teste técnico parcial. Cada entidade funcional precisa provar CRUD completo, persistência, vínculo correto, consistência UI x Supabase/Storage, retomada, reload/logout-login, impacto correto no relatório e cleanup.

Como a matriz será estruturada?

A matriz será organizada por entidade/área funcional. Para cada uma haverá: Create, Read, Update, Delete quando aplicável, validação de persistência após sair/reload/logout-login, vínculo com entidades relacionadas, validação UI x Supabase/Storage, evidência esperada e critério de bloqueio P0.

Quais áreas funcionais entram na matriz?

1. Login/sessão; 2. Imóvel; 3. Vistoria; 4. Histórico/rascunho; 5. Cômodos; 6. Fotos/Storage; 7. Privacy guard; 8. IA controlada; 9. Revisão humana; 10. Relatório/PDF; 11. Reload/logout-login/retomada; 12. Cleanup.

Login/sessão — o que precisa ser testado?

Login válido, sessão ativa, logout, login novamente, retomada de sessão e acesso às entidades do usuário correto. Depois de criar/editar dados, o teste deve fazer logout-login e confirmar que o mesmo usuário retoma os mesmos dados. Bloqueia se misturar usuário, perder sessão indevidamente ou não retomar.

Imóvel — o que precisa ser testado?

CRUD completo do imóvel dentro do suporte da UI: criar imóvel, listar/reabrir imóvel, editar dados relevantes, deletar imóvel se a UI permitir, validar persistência após sair/reload/logout-login, vincular vistoria ao imóvel correto e validar UI x Supabase. Se delete de imóvel não existir, registrar GAP_PRODUCT_DECISION.

Vistoria — o que precisa ser testado?

CRUD/ciclo de vida completo da vistoria: criar vistoria, listar/reabrir, editar/continuar, cancelar/deletar/descartar quando aplicável, vincular ao imóvel correto, validar status, sair/reload/logout-login/reabrir, concluir quando aplicável e impedir que defaults ou rascunhos vazios sobrescrevam uma vistoria real.

Histórico/rascunho — o que precisa ser testado?

Voltar sem ação real não pode gerar lixo no histórico. Vistoria real deve aparecer com identificação coerente. Reabrir pelo histórico deve abrir exatamente o mesmo inspection_id. Após sair/reload/logout-login, o histórico deve continuar correto. Bloqueia se abrir entidade errada, rascunho vazio, vistoria parecida ou dados inconsistentes.

Cômodos — o que precisa ser testado?

CRUD completo de cômodos: listar/selecionar cômodos padrão, criar cômodo novo, ler/reabrir cômodo, editar/renomear, deletar cômodo vazio, tratar tentativa de deletar cômodo com foto/análise/revisão de forma segura, trocar de cômodo sem perder estado, sair/reload/logout-login/reabrir e confirmar UI x Supabase.

Cômodos — quais vínculos precisam ser testados?

Cômodo precisa manter vínculo correto com vistoria, fotos, sugestões de IA, revisões humanas e relatório/PDF. O relatório não pode mostrar nome antigo de cômodo, cômodo deletado ou foto vinculada ao cômodo errado.

Fotos/Storage — o que precisa ser testado?

CRUD completo de fotos dentro do suporte atual da UI: upload/criação de foto, leitura/listagem, vínculo foto → cômodo → vistoria, persistência após sair/reload/logout-login, remoção/delete de foto, validação no Supabase/Storage e cleanup. Bloqueia se a foto ficar órfã, vinculada ao cômodo errado, reaparecer após delete ou sumir após reload.

Privacy guard — o que precisa ser testado?

Antes da análise IA, o app deve exibir aviso de privacidade e exigir aceite. A análise deve ficar bloqueada antes do aceite e liberada depois. O aceite/estado de privacidade deve persistir de forma coerente no fluxo esperado, inclusive após sair/reload/logout-login, e não pode permitir IA sem consentimento.

IA controlada — o que precisa ser testado?

CRUD/ciclo funcional das análises IA: gerar análise/sugestão, ler/exibir sugestão, manter vínculo com foto/cômodo/vistoria, atualizar estado por revisão humana, invalidar/remover associação se foto/cômodo for deletado, e validar persistência após sair/reload/logout-login.

IA controlada — qual é o limite da matriz?

Até 3 fotos, máximo 3 chamadas OpenAI, custo total máximo R$ 0,45 base / R$ 0,75 stress. O teste bloqueia se houver risco de passar do limite, se ocorrer reanálise automática ou se a IA for chamada fora do fluxo autorizado.

Revisão humana — o que precisa ser testado?

CRUD/ciclo funcional da revisão: criar decisão de revisão, ler/reabrir decisão, editar texto revisado, aceitar sugestão, rejeitar sugestão se suportado e validar persistência após sair/reload/logout-login. A decisão revisada precisa ser usada corretamente no relatório/PDF.

Relatório/PDF — o que precisa ser testado?

CRUD/ciclo funcional do relatório: gerar relatório/PDF, visualizar/reabrir relatório, atualizar/regenerar se fluxo suportar, remover/limpar relatório de teste no cleanup e validar que ele usa dados atuais do imóvel, vistoria, cômodos, fotos e revisões humanas. O relatório não pode refletir dados antigos, defaults ou entidades deletadas.

Reload/logout-login/retomada — o que precisa ser testado?

Essa validação é obrigatória em todas as entidades e ações funcionais. Depois de criar, ler, editar ou deletar qualquer entidade crítica, o teste deve sair, recarregar, fazer logout-login, reabrir e confirmar que o estado continua correto.

Cleanup — o que precisa ser testado?

Ao final, o teste deve remover todos os dados criados: imóvel de teste, vistorias, cômodos, fotos, análises IA, revisões, relatórios e arquivos no Storage. O cleanup deve confirmar ausência de leftovers relevantes em Supabase/Storage.

O que é P0 na matriz?

Qualquer perda de dados, CRUD incompleto de entidade crítica sem decisão explícita, divergência UI x Supabase/Storage, entidade errada aberta, rascunho lixo, persistência quebrada após sair/reload/logout-login, foto órfã, IA sem persistência, revisão perdida, relatório errado, cleanup incompleto, secret exposto ou custo fora do limite.

O que é P1/P2 na matriz?

P1 é problema importante que não impede necessariamente a jornada principal, mas precisa ser registrado. P2 é melhoria de UX, visual, texto, ordem de campos ou refinamento. P1/P2 não podem ser usados para mascarar P0.

Como gaps devem ser tratados?

Se uma funcionalidade esperada não existir na UI atual, o gate deve registrar GAP_PRODUCT_DECISION, não PASS falso. O gap bloqueia UAT se afetar CRUD completo de entidade crítica da jornada principal ou se Gustavo definir como obrigatório para o UAT de hoje.

Qual é a evidência esperada da matriz?

Cada gate derivado da matriz deve gerar relatório .json e .md, contendo status, ações executadas, entidades criadas/editadas/deletadas, validações UI x Supabase/Storage, validações após sair/reload/logout-login, chamadas OpenAI, custo estimado, resultado de cleanup, P0/P1/P2/gaps e decisão objetiva de PASS/BLOCKED/FAIL.

Quando o Item 2 estará aprovado?

Quando Gustavo aprovar que essa matriz cobre corretamente o produto real a ser validado antes do UAT Manual. Só depois disso Codex pode receber o prompt baseado na matriz aprovada.

Regra central do item 2

A Matriz Funcional Pré-UAT deve provar funcionalmente, entidade por entidade, que o app executa CRUD completo das entidades críticas, persiste em todos os níveis funcionais, retoma, vincula e limpa corretamente antes de Gustavo receber o UAT Manual.


## Item 3 — Conteúdo aprovado

### Item 3 — Ajuste aprovado para governança

Estas são as linhas atualizadas do item 3.

**Pergunta**

**Resposta**

Qual é o objetivo do Item 3?

Transformar o Item 1 — Plano Mestre e o Item 2 — Matriz Funcional Pré-UAT em uma instrução operacional fechada para o Codex executar, obedecendo sempre os documentos de governança do projeto já criados e armazenados em diretório acessível pelo Codex. O prompt deve orientar Codex a criar/ajustar gates, executar pré-UAT automatizado completo, corrigir somente P0 capturado por evidência e preparar a RC apenas se todos os critérios forem cumpridos.

Quais documentos Codex deve ler antes de agir?

Codex deve ler e obedecer obrigatoriamente os documentos de governança do projeto: AGENTS.md, ops/current_contract.md, ops/codex_task.md, ops/codex_result_template.md, docs/decisions/decision-log.md, além dos Itens 1 e 2 aprovados e congelados.

Qual é a hierarquia de autoridade para Codex?

Em caso de conflito, Codex deve obedecer esta ordem: 1. documentos de governança do projeto; 2. Item 1 aprovado; 3. Item 2 aprovado; 4. tarefa específica do Item 3; 5. implementação técnica. Se houver conflito entre instruções, Codex deve parar e retornar BLOCKED_CONTRACT_CONFLICT, sem executar patch, commit ou push.
