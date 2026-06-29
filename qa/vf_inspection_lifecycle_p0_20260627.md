# VF INSPECTION-LIFECYCLE-P0

STATUS FINAL: PASS

Branch: stabilization/persistence-p0
Base URL: http://127.0.0.1:4291
Run ID: inspection_lifecycle_p0_1782603235512
Inicio: 2026-06-27T23:33:55.513Z
Fim: 2026-06-27T23:34:49.134Z

## Reproducao

- Falha reproduzida: nao
- Causa raiz: EMPTY_DRAFT_CREATED_ON_START_WAS_NOT_DISCARDED_AND_HISTORY_DID_NOT_FILTER_DEFAULT_ONLY_DRAFTS_BEFORE_FIX

## Diagnostico Obrigatorio

1. Edicao de comodo salva no Supabase: YES
2. Salva no inspection_id correto: YES
3. UI usa estado local sem reidratar corretamente: NO_REPRODUCED
4. Defaults sobrescrevem dados persistidos: NO
5. Nova Vistoria cria rascunho imediatamente: TRANSIENT_ONLY_DISCARDED_ON_BACK
6. Voltar/cancelar deixa rascunho orfao: NO
7. Historico ordena/filtra corretamente: YES_BY_EXPLICIT_INSPECTION_ID
8. App retoma vistoria errada: NO
9. Supabase diverge da UI: NO

## Matriz

| Fase | Resultado | Evidencia |
| --- | --- | --- |
| setup usuario tecnico | PASS | Usuario e entitlement criados por admin local isolado |
| base limpa local | PASS | Vite local http://127.0.0.1:4291 |
| login tecnico | PASS | Login abriu Meus Imoveis |
| imovel criar/listar/persistir | PASS | property_id=96b5490b-ee99-40e9-88fe-84f759a41304 |
| Nova Vistoria + voltar antes de comecar | PASS | Nenhuma inspection criada antes do botao Comecar Vistoria |
| Comecar Vistoria + voltar sem acao real | PASS | Rascunho vazio 3e781c0f-26fc-458c-b990-2b267bd947e0 removido; rooms/photos/ai/reports/storage sem leftovers |
| vistoria criar/abrir | PASS | inspection_id=ec05b72b-2bf1-40f5-8a6b-836e59570bdc |
| comodo existente editar | PASS | Sala Editada P0 235512 visivel e persistido |
| sair/voltar/continuar rascunho correto | PASS | Card localizado por inspection_id; alteracao permaneceu |
| reload/retomada | PASS | Comodo editado permaneceu |
| logout/login/retomada | PASS | Comodo editado permaneceu na vistoria correta |
| comodos criar/editar/deletar | PASS | Comodo Novo Editado P0 235512 persistido; Comodo Temporario P0 235512 removido |
| matriz final de persistencia | PASS | Criado/editado/deletado preservado em back, reload e logout/login |
| Nova Vistoria + voltar | PASS | inspections before=1; after=1 |
| historico identifica vistoria correta | PASS | Rascunho aberto por codigo ec05b72b-2bf1-40f5-8a6b-836e59570bdc |
| Supabase x UI | PASS | 10 rooms vinculados ao inspection_id correto; fotos=0; IA=0 |

## Estado Supabase/UI

- Property ID: 96b5490b-ee99-40e9-88fe-84f759a41304
- Inspection ID: ec05b72b-2bf1-40f5-8a6b-836e59570bdc
- Rooms finais: Sala Editada P0 235512, Quarto 1, Quarto 2, Banheiro, Cozinha, Área de Serviço, Varanda, Garagem, Outros, Comodo Novo Editado P0 235512
- Total de fotos criadas: 0
- Rascunho vazio removido/oculto: PASS
- Rascunho vazio antes do descarte: {"status":"em_andamento","rooms":9,"photos":0,"aiAnalysisRows":0,"reports":0,"storagePhotos":0,"storageReports":0}
- Rascunho vazio depois do descarte: {"inspection":0,"rooms":0,"photos":0,"aiAnalysisRows":0,"reports":0,"storagePhotos":0,"storageReports":0}
- Vistoria com acao real: {"inspection":1,"rooms":10,"photos":0,"aiAnalysisRows":0,"reports":0,"storagePhotos":0,"storageReports":0}

## Custo

- OpenAI chamada: 0
- Tokens: 0
- Custo OpenAI: R$ 0.00

## Runtime

- Console errors: 0
- Page errors: 0
- Failed requests: 2
- HTTP 5xx: 0
- AI requests: 0

## Cleanup

- Cleanup: PASS
- Leftovers: {"propertiesRows":0,"inspectionsRows":0,"roomsRows":0,"photosRows":0,"reportsRows":0,"entitlementsRows":0,"eventsRows":0,"profileRows":0,"authUserExists":false}

## Evidencias

- Relatorio MD: qa/vf_inspection_lifecycle_p0_20260627.md
- Relatorio JSON: qa/vf_inspection_lifecycle_p0_20260627.json



UAT nao foi liberado.
