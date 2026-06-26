# VF Real User Journey UAT - 2026-06-26

Status: PASS

URL testada: http://127.0.0.1:5178
Run ID: uat_real_1782492447046
Inicio: 2026-06-26T16:47:27.047Z
Fim: 2026-06-26T16:48:21.682Z

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
- Leftovers: {"propertiesRows":0,"inspectionsRows":0,"roomsRows":0,"photosRows":0,"reportsRows":0,"entitlementsRows":0,"eventsRows":0,"profileRows":0,"authUserExists":false,"storage:b57083eb-98c9-4fa3-9faf-99e94d522d2f/photos/3b259f0a-9a2d-474d-8308-9aa7d0255440/878ee91d-33e0-475c-ae1f-f0b2f0207b9d.jpg":false,"storage:b57083eb-98c9-4fa3-9faf-99e94d522d2f/photos/3b259f0a-9a2d-474d-8308-9aa7d0255440/5369769b-8f7f-44e5-820d-b04c36329b6e.jpg":false,"storage:b57083eb-98c9-4fa3-9faf-99e94d522d2f/photos/3b259f0a-9a2d-474d-8308-9aa7d0255440/b23dd304-298e-4f78-84d6-44194f760d02.jpg":false,"storage:b57083eb-98c9-4fa3-9faf-99e94d522d2f/photos/3b259f0a-9a2d-474d-8308-9aa7d0255440/c9304658-07b7-4ad9-9d65-3110fd8d284c.jpg":false,"storage:b57083eb-98c9-4fa3-9faf-99e94d522d2f/photos/3b259f0a-9a2d-474d-8308-9aa7d0255440/4179dc3a-5fc5-49f1-a56c-e97daaa0c855.jpg":false,"storage:b57083eb-98c9-4fa3-9faf-99e94d522d2f/photos/3b259f0a-9a2d-474d-8308-9aa7d0255440/82a1c317-a4ec-44d8-9eaa-f211f4b5ec3c.jpg":false,"storage:b57083eb-98c9-4fa3-9faf-99e94d522d2f/photos/3b259f0a-9a2d-474d-8308-9aa7d0255440/c94d59d1-9386-4b27-b85b-4b57543c0732.jpg":false,"storage:b57083eb-98c9-4fa3-9faf-99e94d522d2f/photos/3b259f0a-9a2d-474d-8308-9aa7d0255440/fbf83f88-e2e9-410c-a2e8-0a1a2c4ff05c.jpg":false,"storage:b57083eb-98c9-4fa3-9faf-99e94d522d2f/photos/3b259f0a-9a2d-474d-8308-9aa7d0255440/823adcce-adb7-4acf-88b4-ba7fa39d3505.jpg":false,"storage:b57083eb-98c9-4fa3-9faf-99e94d522d2f/photos/3b259f0a-9a2d-474d-8308-9aa7d0255440/3180d123-1619-471f-8c46-b27747fefe52.jpg":false}

## Decisao

UAT manual pode comecar como rodada controlada. UAT nao foi liberado automaticamente.


