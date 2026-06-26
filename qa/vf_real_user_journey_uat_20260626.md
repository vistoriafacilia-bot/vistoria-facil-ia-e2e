# VF Real User Journey UAT - 2026-06-26

Status: PASS

URL testada: https://glittery-boba-2b3367.netlify.app
Run ID: uat_real_1782493062621
Inicio: 2026-06-26T16:57:42.622Z
Fim: 2026-06-26T16:58:57.325Z

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
| Voltar/Sair/Retomar | PASS | Historico e Continuar Rascunho exercitados. |
| Concluir/Revisar | PASS | Botao exercitado e avancou para revisao/relatorio. |

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
- Leftovers: {"propertiesRows":0,"inspectionsRows":0,"roomsRows":0,"photosRows":0,"reportsRows":0,"entitlementsRows":0,"eventsRows":0,"profileRows":0,"authUserExists":false,"storage:6eed3010-e968-415e-96dd-4d977009dca8/photos/d3fc5f58-0a77-4008-91a9-c0c6ae77a20b/40e1c7e2-930d-414a-a4b2-16ae945e3dbc.jpg":false,"storage:6eed3010-e968-415e-96dd-4d977009dca8/photos/d3fc5f58-0a77-4008-91a9-c0c6ae77a20b/7132ccff-0fd8-404d-ad25-527a13e53732.jpg":false,"storage:6eed3010-e968-415e-96dd-4d977009dca8/photos/d3fc5f58-0a77-4008-91a9-c0c6ae77a20b/d017e24e-5a43-4022-aabf-538ffa8a1480.jpg":false,"storage:6eed3010-e968-415e-96dd-4d977009dca8/photos/d3fc5f58-0a77-4008-91a9-c0c6ae77a20b/e01f1332-f1e8-4053-b800-d1365a664422.jpg":false,"storage:6eed3010-e968-415e-96dd-4d977009dca8/photos/d3fc5f58-0a77-4008-91a9-c0c6ae77a20b/d8503aa7-3c36-4b2e-8f97-5ba12cdd71f3.jpg":false,"storage:6eed3010-e968-415e-96dd-4d977009dca8/photos/d3fc5f58-0a77-4008-91a9-c0c6ae77a20b/c822b87a-35d4-489d-aa66-8a3511c06a72.jpg":false,"storage:6eed3010-e968-415e-96dd-4d977009dca8/photos/d3fc5f58-0a77-4008-91a9-c0c6ae77a20b/1933f388-9cb9-439f-a980-772f26f4d0e3.jpg":false,"storage:6eed3010-e968-415e-96dd-4d977009dca8/photos/d3fc5f58-0a77-4008-91a9-c0c6ae77a20b/eb6cb1a3-040d-4aa4-9042-451282860365.jpg":false,"storage:6eed3010-e968-415e-96dd-4d977009dca8/photos/d3fc5f58-0a77-4008-91a9-c0c6ae77a20b/7a73b6b8-384e-40de-b6c2-64e67397ab99.jpg":false,"storage:6eed3010-e968-415e-96dd-4d977009dca8/photos/d3fc5f58-0a77-4008-91a9-c0c6ae77a20b/4665e1f5-ce44-4080-aee5-336fcc990721.jpg":false}

## Decisao

UAT manual pode comecar como rodada controlada. UAT nao foi liberado automaticamente.


