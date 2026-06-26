# VF Real User Journey UAT - 2026-06-26

Status: PASS

URL testada: https://glittery-boba-2b3367.netlify.app
Run ID: uat_real_1782492870767
Inicio: 2026-06-26T16:54:30.768Z
Fim: 2026-06-26T16:55:36.126Z

## Correcao de criterio

- UAT massivo anterior reclassificado como PASS tecnico controlado.
- UAT real fim a fim exige navegador limpo, URL publica, cliques em botoes visiveis e login pela UI real.
- Service role foi usado somente para setup/cleanup administrativo local.

## Botoes e links visiveis auditados

| Item | Status | Observacao |
|---|---|---|
| Entrar | PASS | Botao principal de login por e-mail/senha. |
| Google login | OCULTADO_CORRETAMENTE | Provider Google nao esta habilitado neste ambiente. |
| Criar local/imovel | PASS | Botao Cadastrar visivel e exercitado. |
| Editar local/imovel | PASS | Botao de edicao exercitado pela UI. |
| Nova vistoria | PASS | Botao visivel e exercitado. |
| Entrada/Saida | PASS | Escolha Entrada/Saida visivel; Entrada exercitada. |
| Adicionar comodo | PASS | Criacao de comodo pela UI. |
| Editar comodo | PASS | Renomeacao de comodo pela UI. |
| Deletar comodo | PASS | Exclusao visivel e exercitada antes de fotos. |
| Adicionar foto | PASS | Upload pela UI com input de arquivo. |
| Deletar foto | PASS | Exclusao de foto pela UI. |
| Concluir/Revisar | NOT_EXERCISED | A rodada validou foto/revisao e retomada; conclusao completa fica para UAT manual controlado. |
| Voltar/Sair/Retomar | PASS | Historico e Continuar Rascunho exercitados. |

## Caminhos testados

- Login e-mail/senha: PASS
- Redirect Google ausente: PASS
- CRUD local/imovel: PASS
- CRUD vistoria/comodos: PASS
- Fotos via UI: PASS
- Limite de plano via UI: PASS
- Fallback Sem Analise de IA: PASS
- Revisao manual: PASS
- Persistencia/retomada: PASS
- Cleanup: PASS

## Caminhos removidos/ocultados

- Entrar com o Google: OCULTADO_CORRETAMENTE
- Texto tecnico de staging na jornada publica: OCULTADO_CORRETAMENTE

## Runtime

- Console errors criticos: 0
- Page errors: 0
- Failed requests criticos: 0
- Failed requests esperados na senha errada: 0

## Cleanup

- Cleanup total: PASS
- Leftovers: {"propertiesRows":0,"inspectionsRows":0,"roomsRows":0,"photosRows":0,"reportsRows":0,"entitlementsRows":0,"eventsRows":0,"profileRows":0,"authUserExists":false,"storage:fd477bb1-0ac3-4a33-a9a2-9a3f2279b9c4/photos/e9d563b5-d1a7-4327-8245-243364549dc9/3ef3451f-b555-4c4f-afd8-afd06d895c30.jpg":false,"storage:fd477bb1-0ac3-4a33-a9a2-9a3f2279b9c4/photos/e9d563b5-d1a7-4327-8245-243364549dc9/d2171d9e-4162-496b-9fea-3ba76bd89dcc.jpg":false,"storage:fd477bb1-0ac3-4a33-a9a2-9a3f2279b9c4/photos/e9d563b5-d1a7-4327-8245-243364549dc9/2e096163-7efc-4040-95f4-86271b1748df.jpg":false,"storage:fd477bb1-0ac3-4a33-a9a2-9a3f2279b9c4/photos/e9d563b5-d1a7-4327-8245-243364549dc9/6e3a9e6a-2d52-4e10-9efa-1c0668d9bd6f.jpg":false,"storage:fd477bb1-0ac3-4a33-a9a2-9a3f2279b9c4/photos/e9d563b5-d1a7-4327-8245-243364549dc9/6f973932-e5d7-44c8-9687-ba204b3bc011.jpg":false,"storage:fd477bb1-0ac3-4a33-a9a2-9a3f2279b9c4/photos/e9d563b5-d1a7-4327-8245-243364549dc9/f844bb6c-90c7-48d6-9d10-b29ad189b6c9.jpg":false,"storage:fd477bb1-0ac3-4a33-a9a2-9a3f2279b9c4/photos/e9d563b5-d1a7-4327-8245-243364549dc9/d12379c9-5ee4-4dd6-9db5-3195d39cea87.jpg":false,"storage:fd477bb1-0ac3-4a33-a9a2-9a3f2279b9c4/photos/e9d563b5-d1a7-4327-8245-243364549dc9/9a703e2e-709c-40ca-b37e-47dbed4b2196.jpg":false,"storage:fd477bb1-0ac3-4a33-a9a2-9a3f2279b9c4/photos/e9d563b5-d1a7-4327-8245-243364549dc9/014ffd62-99c1-48e6-9b90-10b821f2b155.jpg":false,"storage:fd477bb1-0ac3-4a33-a9a2-9a3f2279b9c4/photos/e9d563b5-d1a7-4327-8245-243364549dc9/2e45754f-70e6-4e1c-834d-905f466dc0b8.jpg":false}

## Decisao

UAT manual pode comecar como rodada controlada. UAT nao foi liberado automaticamente.


