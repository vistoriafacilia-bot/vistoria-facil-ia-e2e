# VF UAT Funcional Real Completo - 2026-06-27

STATUS FINAL: PASS_CORE_WITH_GAPS_NO_COST

URL testada: https://glittery-boba-2b3367.netlify.app
Run ID: real_complete_1782554264206
Inicio: 2026-06-27T09:57:44.207Z
Fim: 2026-06-27T09:58:39.707Z
FASE A - Core sem custo: PASS
FASE B - IA controlada: NOT_EXECUTED_CORE_CERTIFICATION
Modo do gate: core-certification
Fase B autorizada por ambiente: nao
Modo Discovery sem custo: nao

## Inventario e Amostragem

- Diretorio: E:\AI - Aprendizado\VistoriaFacilIA\Fotos para Testes
- Comodos detectados: 10
- Fotos validas no acervo: 158
- Fotos selecionadas para IA: 50
- Limite inicial de IA: 50 fotos
- FASE A permite upload de fotos: nao, porque upload pode disparar IA automaticamente
- Custo acervo completo base: R$ 23.70
- Custo acervo completo stress: R$ 39.50
- Custo amostra base: R$ 7.50
- Custo amostra stress: R$ 12.50

| Comodo | Fotos no acervo | Fotos selecionadas |
| --- | ---: | ---: |
| Area Externa | 37 | 5 |
| Banheiro 1 | 10 | 5 |
| Banheiro 2 | 16 | 5 |
| Banheiro 3 | 11 | 5 |
| Cozinha | 33 | 5 |
| Quarto 2 | 5 | 5 |
| Quarto 3 | 6 | 5 |
| Sala Piso 2 | 16 | 5 |
| Sala Sala Piso 1 | 16 | 5 |
| Varanda Sala | 8 | 5 |

## Matriz por Fase

| Fase | Caso | Acao | Esperado | Resultado | Status | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Inventario | Mapear subpastas e selecionar ate 5 fotos por comodo com maximo total 50 | Todos os comodos entram no core e amostra IA fica <= 50 | Acervo 158 fotos | PASS | 50 fotos selecionadas em 10 comodos |
| 1 | Usuario UAT valido | Provisionar usuario tecnico e entitlement beta_paid_4990 | Usuario normal entra pelo frontend; service_role apenas setup/cleanup |  | PASS | Plano beta_paid_4990 com limite 50 |
| 1 | Senha errada | Tentar login com senha invalida | Mensagem clara sem autenticar |  | PASS | Mensagem de credenciais invalidas exibida |
| 1 | Esqueci senha | Solicitar recuperacao uma vez | Solicitacao aceita ou bloqueio externo documentado |  | GAP | P1/P2: rate limit Supabase Auth; Discovery continua |
| 1 | Esqueci e-mail | Procurar fluxo equivalente | Registrar suporte ou GAP funcional |  | NOT_SUPPORTED | Nao existe controle visivel de recuperar e-mail. |
| 1 | Login valido | Entrar com usuario UAT | Abrir Meus Imoveis |  | PASS | Login por e-mail/senha abriu app autenticado |
| 1 | Logout/login | Sair e entrar novamente | Sessao volta sem erro |  | PASS | Logout retornou ao auth e login reabriu app |
| 2 | CRUD imovel | Criar, listar, alterar, reload, logout/login e deletar temporario | Imovel principal persiste e temporario some |  | PASS | UI validada; Supabase validado no fechamento |
| 3 | CRUD vistoria | Criar entrada, listar/retomar, reload/logout-login e deletar temporaria | Vistoria principal persiste vinculada ao imovel |  | PASS_WITH_GATE_FALLBACK | inspectionId=fa5b4916-2aa5-4c6f-aa73-c6aaf41cd5c5; evidencias={"operational":true,"photoRegistry":true,"fileInputCount":2,"addRoomVisible":true,"roomRows":9,"backToHistory":true,"reviewButton":true,"url":"https://glittery-boba-2b3367.netlify.app/?uat_real_complete=real_complete_1782554264206"} |
| 3 | Alterar vistoria | Procurar controle de edicao de metadados/status | Alterar se suportado |  | NOT_SUPPORTED | Sem UI dedicada alem do fluxo rascunho/concluir. |
| 4 | CRUD comodos | Criar comodos por subpasta, editar um, deletar temporario, reload/logout-login | Todos os comodos persistem |  | PASS | 10 comodos validados |
| A | Barreira custo zero FASE A | Validar Auth, imovel, vistoria, comodos, Supabase e nenhum uso de IA | 0 fotos, 0 tokens, 0 requests IA antes da FASE B |  | PASS | 10 comodos persistidos; custo OpenAI R$ 0.00 |
| B | FASE B nao executada | Recalcular custo e manter IA bloqueada no gate core | Nao subir fotos nem chamar OpenAI |  | NOT_EXECUTED | Amostra IA 50/50; base R$ 7.50; stress R$ 12.50 |
| 9 | Cleanup | Remover dados e fotos do teste | Sem leftovers no Supabase/Storage/Auth |  | PASS | Cleanup total confirmado |

## Totais

- Quantidade de comodos criados/validados: 10
- Quantidade de fotos processadas: 0
- Quantidade de fotos analisadas por IA: 0
- Uso total de tokens: 0
- Input tokens: 0
- Output tokens: 0
- Custo estimado base: R$ 0.00
- Custo estimado stress: R$ 0.00
- Custo OpenAI FASE A: R$ 0.00

## Gaps Funcionais

- Esqueci senha bloqueado por rate limit Supabase Auth; nao bloqueia Discovery core.
- Esqueci e-mail / recuperar e-mail nao existe na UI publica atual.
- Gate aceitou vistoria temporaria por evidencia funcional sem texto Registro de Fotos. Screenshot: test-results\uat-governance\real_complete_1782554264206_temporaria_functional_evidence_without_photo_registry_text.png
- Edicao de metadados/status de vistoria nao tem controle dedicado na UI atual.

## Bugs Bloqueadores

- Nenhum bug bloqueador registrado.

## Runtime

- Console errors criticos: 0
- Page errors: 0
- Failed requests criticos: 0
- HTTP criticos: 0
- HTTP esperados: 2
- Requests IA antes da FASE B: 0

## Cleanup

- Cleanup total: sim
- Leftovers: {"propertiesRows":0,"inspectionsRows":0,"roomsRows":0,"photosRows":0,"reportsRows":0,"entitlementsRows":0,"eventsRows":0,"profileRows":0,"authUserExists":false}

## Evidencias

- Relatorio MD: qa/vf_uat_core_certification_20260627.md
- Relatorio JSON: qa/vf_uat_core_certification_20260627.json



UAT nao foi liberado automaticamente.
