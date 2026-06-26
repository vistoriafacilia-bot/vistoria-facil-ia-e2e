# VF UAT Full Regression - 2026-06-26

STATUS FINAL: FAIL

URL testada: https://glittery-boba-2b3367.netlify.app
Run ID: uat_full_1782510002602
Inicio: 2026-06-26T21:40:02.603Z
Fim: 2026-06-26T21:41:13.060Z

## Resumo

- PASS: Login com senha errada; Login correto; Logout/login; Ver Planos; Catalogo de planos; Imovel criar/listar; Imovel alterar; Imovel deletar; Imovel sair/voltar/reload/relogin; Vistoria de Entrada criar; Vistoria listar/continuar rascunho; Vistoria deletar; Vistoria sem duplicacao; Comodos padrao; Comodos criar/alterar/deletar; Comodos persistencia completa; Template nao sobrescreve; Fotos adicionar/visualizar; Fotos deletar/substituir; Fotos limite de plano; Fotos persistencia Storage; Descricao/observacao manual; Revisao persistente; Relatorio/PDF gerar; Relatorio conteudo; Relatorio acessivel depois
- FAIL: Fallback Sem Analise de IA
- BLOCKED: Esqueci senha; Criar conta publica; IA real analisa foto
- NOT_SUPPORTED: Reenviar confirmacao; Vistoria alterar; Rejeitar sugestao
- IA real funcionou: nao
- Relatorio/PDF publico funcionou: sim
- Persistencia pos logout/login passou: sim
- Cleanup total: sim

## Matriz funcional

Funcionalidade | Tela | Botao/campo usado | Acao esperada | Resultado imediato | Resultado apos navegar fora/voltar | Resultado apos reload | Resultado apos logout/login | Persistiu no Supabase? | Cleanup executado? | Status | Evidencia/resumo
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
Login com senha errada | Tela publica de auth | Campo Senha + botao Entrar | Exibir mensagem clara sem autenticar | Mensagem clara exibida para senha errada. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Nao verificado ainda. | Nao executado ainda. | PASS | Texto orienta criar conta quando necessario.
Login correto | Tela publica de auth | E-mail/senha + botao Entrar | Autenticar e abrir Meus Imoveis | Login correto abriu Meus Imoveis. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Nao verificado ainda. | Nao executado ainda. | PASS | Usuario tecnico normal autenticado via UI publica.
Esqueci senha | Tela publica de auth | Botao Esqueci minha senha | Solicitacao aceita ou bloqueio externo registrado | Resultado: rate_limit. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Nao verificado ainda. | Nao executado ainda. | BLOCKED | Possivel limite externo do Supabase Auth.
Criar conta publica | Tela publica de auth | Aba Criar conta + botao Criar conta | Criar conta ou registrar rate limit 429 sem repetir | Supabase Auth limitou criacao de conta. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Nao verificado ainda. | Cleanup administrativo executado. | BLOCKED | Erro 429/rate limit detectado; o gate nao repetiu tentativa.
Reenviar confirmacao | Tela publica de auth | Botao/link de reenviar confirmacao | Produto futuro se necessario. | Nao ha UI de reenviar confirmacao hoje. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Nao verificado ainda. | Nao executado ainda. | NOT_SUPPORTED | Gap de produto documentado, nao classificado como bug tecnico.
Logout/login | Navbar | Botao sair + login novamente | Sair e entrar sem perder dados | Logout levou para tela publica e login retornou. | Nao executado ainda. | Nao executado ainda. | Dados principais continuaram acessiveis. | Nao verificado ainda. | Nao executado ainda. | PASS | Fluxo exercitado com usuario normal.
Ver Planos | Home autenticada | Botao Ver Planos | Abrir planos sem voltar automaticamente para home | Clique abriu tela de planos. | Tela permaneceu em planos ate acao explicita de voltar. | Nao executado ainda. | Nao executado ainda. | Nao verificado ainda. | Nao executado ainda. | PASS | Nao houve retorno automatico para home.
Catalogo de planos | Tela de planos | Cards/lista de planos | Exibir free_10, beta_paid_4990 e limites 10/50 | free_10 e beta_paid_4990 visiveis. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Planos reais consultados no Supabase durante setup. | Nao executado ainda. | PASS | Limites detectados: free_10=10, beta_paid_4990=50.
Imovel criar/listar | Meus Imoveis | Cadastrar Imovel + Salvar Imovel | Criar e listar imovel real | Imovel criado e listado na tela. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Sim, confirmado no Supabase/Storage por consulta admin. | Cleanup administrativo executado. | PASS | Full UAT uat_full_1782510002602
Imovel alterar | Card do imovel | Botao Editar imovel | Persistir alteracao no Supabase | Nome e observacao do imovel alterados pela UI. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Sim, confirmado no Supabase/Storage por consulta admin. | Cleanup administrativo executado. | PASS | Full UAT uat_full_1782510002602 editado
Imovel deletar | Card do imovel | Botao Excluir imovel + modal | Excluir e nao reaparecer | Imovel temporario deletado pela UI e sumiu da lista. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Cleanup final tambem verifica leftovers do usuario. | Cleanup administrativo executado. | PASS | Full UAT delete uat_full_1782510002602
Imovel sair/voltar/reload/relogin | Meus Imoveis/Historico | Historico, voltar, reload, logout/login | Imovel editado permanece visivel | Imovel editado continuou visivel. | Historico abriu corretamente. | Reload manteve sessao e dados. | Imovel editado visivel apos logout/login. | Sim, confirmado no Supabase/Storage por consulta admin. | Cleanup administrativo executado. | PASS | Full UAT uat_full_1782510002602 editado
Vistoria de Entrada criar | Nova Vistoria | Vistoria de Entrada + Comecar Vistoria | Criar rascunho de entrada | Vistoria de Entrada criada. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Linha de inspections encontrada por admin. | Cleanup administrativo executado. | PASS | inspectionId=60631aab-8813-47c4-8156-6ece62d12ffc
Vistoria listar/continuar rascunho | Historico de Vistorias | Continuar Rascunho | Reabrir rascunho correto | Historico listou vistoria e Continuar Rascunho reabriu a correta. | Dados principais visiveis apos voltar e reabrir. | Nao executado ainda. | Nao executado ainda. | Sim, confirmado no Supabase/Storage por consulta admin. | Nao executado ainda. | PASS | Rascunho retomado via UI publica.
Vistoria alterar | Historico/Wizard | Controle de edicao de vistoria | Alterar metadados quando suportado | Nao ha UI de edicao de metadados da vistoria alem do fluxo de rascunho. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Nao verificado ainda. | Nao executado ainda. | NOT_SUPPORTED | Bloqueado ate o passo ser executado.
Vistoria deletar | Historico de Vistorias | Botao Excluir vistoria | Excluir rascunho e nao duplicar sem intencao | Rascunho temporario excluido pela UI. | Historico voltou ao estado sem vistorias. | Nao executado ainda. | Nao executado ainda. | Nao verificado ainda. | Cleanup administrativo executado. | PASS | Botao Excluir vistoria exercitado com confirm dialog.
Vistoria sem duplicacao | Historico de Vistorias | Nova Vistoria/Continuar Rascunho | Nao criar rascunhos extras sem acao explicita | Criacao de vistoria exigiu acao explicita. | Historico mostrou rascunho correto sem duplicata involuntaria. | Nao executado ainda. | Nao executado ainda. | Inspections restantes do usuario: 1. | Cleanup administrativo executado. | PASS | Rascunho temporario foi criado/deletado explicitamente; rascunho principal continuou unico para o fluxo.
Comodos padrao | Wizard de vistoria | Checklist de comodos | Carregar template inicial em nova vistoria | Template inicial carregou Sala e Quarto 1. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Sim, confirmado no Supabase/Storage por consulta admin. | Nao executado ainda. | PASS | Nova vistoria cria comodos padrao uma unica vez.
Comodos criar/alterar/deletar | Wizard de vistoria | Novo comodo, Renomear, Excluir | CRUD real de comodos | Dois comodos renomeados, um criado e um deletado. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Sim, confirmado no Supabase/Storage por consulta admin. | Cleanup administrativo executado. | PASS | Sala Full 002602, Quarto Full 002602, Comodo Full 002602; removido Quarto 2.
Comodos persistencia completa | Wizard/Historico | Voltar, reabrir, reload, logout/login | Comodos editados persistem e deletado nao volta | Navegacao interna preservou comodos. | Voltar ao historico e continuar preservou alteracoes. | Reload e reabertura preservaram comodos e foto. | Comodos editados/criados/deletados corretos apos logout/login. | Sim, confirmado no Supabase/Storage por consulta admin. | Cleanup administrativo executado. | PASS | Preparado para reload e relogin.
Template nao sobrescreve | Wizard reaberto | Continuar Rascunho | Nao recriar template quando ja existe estado persistido | Template padrao nao sobrescreveu os comodos persistidos. | Comodo deletado nao voltou apos reabrir. | Comodo deletado nao voltou apos reload. | Comodo deletado nao voltou apos logout/login. | Sim, confirmado no Supabase/Storage por consulta admin. | Nao executado ainda. | PASS | Quarto 2 permaneceu ausente.
Fotos adicionar/visualizar | Registro de Fotos | Escolher da Galeria | Upload e preview visivel | Upload e preview de imagem ficaram visiveis. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Sim, confirmado no Supabase/Storage por consulta admin. | Cleanup administrativo executado. | PASS | 10 foto(s) sinteticas pequenas processadas no limite do plano.
Fotos deletar/substituir | Registro de Fotos | Excluir foto + novo upload | Foto deletada nao reaparece e nova entra no lugar | Foto inicial deletada; substituicao sera feita por novo upload. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Storage sera verificado no fechamento para garantir que a foto deletada nao ficou. | Cleanup administrativo executado. | PASS | UI nao tem botao dedicado de substituir; delete+novo upload cobre substituicao funcional.
Fotos limite de plano | Registro de Fotos | Contador e botao upload | Abaixo, no limite e acima do limite controlados | Abaixo do limite funcionou; no limite o botao de upload ficou desabilitado. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Nao verificado ainda. | Nao executado ainda. | PASS | Plano free_10 limitou em 10 foto(s); acima do limite bloqueado pela UI sem forcar input desabilitado.
Fotos persistencia Storage | Wizard/Supabase Storage | Reload, logout/login, leitura Storage | Foto persiste no app e no Storage real | Foto permaneceu visivel apos navegacao. | Nao executado ainda. | Reload preservou foto e texto manual. | Foto e descricao manual visiveis apos logout/login. | Storage verificado no fechamento. | Cleanup administrativo executado. | PASS | Preparado para logout/login.
IA real analisa foto | Card de foto | Analise automatica | IA analisa e sugere texto de fato | IA real nao analisou imagem; app exibiu fallback. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Nao verificado ainda. | Nao executado ainda. | BLOCKED | Codigo atual desabilita IA server-side no Supabase Free. GAP DE PRODUTO.
Fallback Sem Analise de IA | Card de foto | Painel Sem Analise de IA | Fallback claro quando IA real nao esta ativa | Fallback apareceu, mas a mensagem neutra de IA indisponivel nao foi encontrada. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Campos analysis_status/fallback_applied verificados no fechamento. | Nao executado ainda. | FAIL | Sem contornar com backend pago.
Descricao/observacao manual | Card de foto | Editar + Salvar Alteracoes | Usuario edita texto/status e salva | Descricao manual e status Atencao salvos pela UI. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Sim, confirmado no Supabase/Storage por consulta admin. | Nao executado ainda. | PASS | Usuario editou texto/observacao e salvou.
Rejeitar sugestao | Card de foto | Botao rejeitar/nao aceitar | Permitir rejeitar sugestao quando suportado | Nao ha botao dedicado de rejeitar sugestao; usuario pode editar manualmente. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Nao verificado ainda. | Nao executado ainda. | NOT_SUPPORTED | Bloqueado ate o passo ser executado.
Revisao persistente | Card de foto | Confirmar Revisao/Salvar Alteracoes | Texto, status e revisao persistem apos relogin | Revisao manual ficou visivel. | Nao executado ainda. | Texto/status persistiram apos reload. | Texto/status persistiram apos logout/login. | Sim, confirmado no Supabase/Storage por consulta admin. | Cleanup administrativo executado. | PASS | Descricao manual e status Atencao reidratados.
Relatorio/PDF gerar | Visualizar Relatorio | Baixar Relatorio PDF | Gerar PDF utilizavel | PDF gerado pela UI publica. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | Registro reports verificado no fechamento. | Cleanup administrativo executado. | PASS | Download foi disparado e mensagem de sucesso apareceu.
Relatorio conteudo | PDF/registro Supabase | Preview/download + tabela reports | Conter imovel, vistoria, comodos, fotos e observacoes | Tela de relatorio mostrou imovel/comodo/resumo. | Nao executado ainda. | Nao executado ainda. | Nao executado ainda. | reports, inspection.pdf_url/status e Storage verificados. | Cleanup administrativo executado. | PASS | reports=1, photos=10, rooms=9.
Relatorio acessivel depois | Historico de Vistorias | Ver PDF / Compartilhar | Relatorio segue acessivel apos logout/login | Relatorio apareceu no historico apos relogin. | Nao executado ainda. | Nao executado ainda. | Botao Ver PDF / Compartilhar abriu a tela de relatorio. | Registro reports verificado no fechamento. | Cleanup administrativo executado. | PASS | Relatorio acessivel apos logout/login.

## Runtime

- Console errors criticos: 0
- Page errors: 0
- Failed requests criticos: 0
- Failed requests esperados: 0
- HTTP criticos: 0
- HTTP esperados: 3
- Signup publico 429: sim

## Bugs encontrados

- Nenhum bug tecnico novo alem dos bloqueios/gaps classificados.

## Gaps de produto

- IA real server-side esta desabilitada no Supabase Free; gate valida fallback e edicao manual, mas IA real permanece BLOCKED/GAP DE PRODUTO.
- Reenviar confirmacao nao existe na UI publica atual.

## Cleanup

- Cleanup user tecnico: PASS
- Cleanup signup publico: PASS
- Leftovers user tecnico: {"propertiesRows":0,"inspectionsRows":0,"roomsRows":0,"photosRows":0,"reportsRows":0,"entitlementsRows":0,"eventsRows":0,"profileRows":0,"authUserExists":false,"storage:4f6c3548-e2cb-47ac-a9ce-d7e0b4bbb6b5/photos/60631aab-8813-47c4-8156-6ece62d12ffc/52276c8a-cf4c-4ec0-a762-c4b850751a4f.jpg":false,"storage:4f6c3548-e2cb-47ac-a9ce-d7e0b4bbb6b5/photos/60631aab-8813-47c4-8156-6ece62d12ffc/cc7b3902-afa9-4e63-902e-4705c7d11c37.jpg":false,"storage:4f6c3548-e2cb-47ac-a9ce-d7e0b4bbb6b5/photos/60631aab-8813-47c4-8156-6ece62d12ffc/316a4cf0-d92b-4b7f-8359-b3b4a4969fee.jpg":false,"storage:4f6c3548-e2cb-47ac-a9ce-d7e0b4bbb6b5/photos/60631aab-8813-47c4-8156-6ece62d12ffc/9b9f66ae-06a6-4a57-be2a-bfd5a9a2a899.jpg":false,"storage:4f6c3548-e2cb-47ac-a9ce-d7e0b4bbb6b5/photos/60631aab-8813-47c4-8156-6ece62d12ffc/2c9e9edb-96fb-42c4-bd2a-29253568e26f.jpg":false,"storage:4f6c3548-e2cb-47ac-a9ce-d7e0b4bbb6b5/photos/60631aab-8813-47c4-8156-6ece62d12ffc/bcbd40b6-a8e2-44a4-9942-8e52e9333881.jpg":false,"storage:4f6c3548-e2cb-47ac-a9ce-d7e0b4bbb6b5/photos/60631aab-8813-47c4-8156-6ece62d12ffc/a4e9ee25-04d3-4c3f-8dec-5a28fa8d1cc3.jpg":false,"storage:4f6c3548-e2cb-47ac-a9ce-d7e0b4bbb6b5/photos/60631aab-8813-47c4-8156-6ece62d12ffc/4fba2c87-c950-44dd-aa01-71a34834e79f.jpg":false,"storage:4f6c3548-e2cb-47ac-a9ce-d7e0b4bbb6b5/photos/60631aab-8813-47c4-8156-6ece62d12ffc/061c10a4-7bcb-4e49-a3aa-eaae0c1b52ee.jpg":false,"storage:4f6c3548-e2cb-47ac-a9ce-d7e0b4bbb6b5/photos/60631aab-8813-47c4-8156-6ece62d12ffc/864048f3-5af9-4670-b8ac-6f897250a495.jpg":false,"storage:4f6c3548-e2cb-47ac-a9ce-d7e0b4bbb6b5/reports/e2f1d7d3-3c33-402e-baaf-32e217615182/60631aab-8813-47c4-8156-6ece62d12ffc/Vistoria_Full_UAT_uat_full_1782510002602_editado_entrada_60631aab-881.pdf":false}
- Leftovers signup publico: {}

## Decisao

UAT manual nao deve comecar como completo ate resolver os itens FAIL/BLOCKED. UAT nao foi liberado automaticamente.


