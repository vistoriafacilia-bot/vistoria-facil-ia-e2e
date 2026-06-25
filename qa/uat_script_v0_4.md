# Roteiro UAT — Vistoria Fácil IA V0.4

Objetivo: UAT deve confirmar aceitação final, não descobrir bug básico.
Pré-condição obrigatória: RC local aprovado e teste real em staging/AI Studio executado pela equipe técnica.

## Massa UAT mínima

- 1 usuário novo.
- 1 imóvel apartamento.
- 1 vistoria de entrada.
- 3 cômodos com foto.
- 1 relatório PDF gerado.
- 1 retorno ao histórico.

## Fluxo UAT pago sandbox

1. Abrir app em ambiente de teste.
2. Login com Google.
3. Escolher plano pago beta.
4. Ir para checkout Mercado Pago sandbox.
5. Aprovar pagamento sandbox.
6. Voltar ao app.
7. Confirmar que acesso não depende apenas da URL de retorno.
8. Confirmar que entitlement pago aparece ativo após webhook/consulta.
9. Confirmar limite exibido de 50 fotos.
10. Criar imóvel.
11. Criar vistoria de entrada.
12. Conferir cômodos padrão.
13. Adicionar fotos por cômodo.
14. Aguardar análise de IA ou fallback controlado.
15. Concluir & Revisar.
16. Gerar PDF.
17. Confirmar PDF salvo em Storage.
18. Voltar ao histórico.
19. Abrir vistoria existente.
20. Abrir PDF persistido.

## Fluxo UAT gratuito

1. Criar/login usuário diferente.
2. Ativar plano gratuito.
3. Confirmar limite de 10 fotos.
4. Confirmar que não há entitlement pago criado pelo client.
5. Criar imóvel/vistoria simples.
6. Testar bloqueio ao ultrapassar limite.

## Critérios de aceitação

- Dados persistem após reload.
- Histórico lista vistoria correta.
- Cômodos não somem.
- Fotos não mudam de cômodo.
- IA/fallback tem status claro.
- Gate bloqueia conclusão sem foto ou com análise pendente.
- PDF nasce da mesma vistoria.
- PDF fica salvo e reabrível.
- Pagamento pendente/recusado não libera plano pago.
- Usuário A não enxerga dados do usuário B.

## Critérios de reprovação imediata

- pagamento pendente libera acesso pago;
- usuário sem entitlement gera PDF pago;
- PDF não persiste;
- histórico vazio após concluir vistoria;
- fotos somem depois de reload;
- app quebra sem mensagem compreensível;
- dados de um usuário aparecem para outro.
