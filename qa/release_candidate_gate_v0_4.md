# Release Candidate Gate — Vistoria Fácil IA V0.4

Status: checklist local para antes de qualquer aplicação no AI Studio ou UAT.
Versão-alvo: V0.4.0-rc2.

## Comandos locais obrigatórios

Executar separadamente para evitar mascarar timeout ou travamento de uma etapa:

```bash
npm run lint
npm run test:ci
npm run build
npm run qa:rc
```

A sequência cobre:

1. TypeScript/lint: `npm run lint`.
2. Testes automatizados: `npm run test:ci`.
3. Build client + server: `npm run build`.
4. Varredura estática de release: `npm run qa:rc`.

## Critério de aprovação

Para considerar Release Candidate local:

- 0 erro de TypeScript.
- 0 teste automatizado falhando.
- build concluído sem erro.
- release gate estático com status PASSED.
- nenhum segredo real commitado no fonte.
- APP_VERSION centralizada e coerente.
- regras Firestore/Storage presentes.
- checklists de pagamento e E2E presentes.

## Bloqueadores automáticos

Bloqueia RC:

- versão antiga em arquivo de produção;
- ausência de regras de pagamento/entitlement;
- ausência de rules de Storage para PDF;
- ausência de `.env.example` com variáveis operacionais;
- ausência do script `qa:rc`;
- qualquer falha em lint, teste ou build.

## Itens que ainda exigem validação no AI Studio/Staging

Mesmo com RC local aprovado, ainda não liberar UAT até validar:

1. login real Google;
2. Firestore real com rules publicadas;
3. Storage real com rules publicadas;
4. Gemini real configurado;
5. Mercado Pago sandbox configurado;
6. webhook acessível publicamente;
7. checkout Pix/cartão em sandbox;
8. entitlement liberado somente após confirmação validada;
9. PDF salvo e reaberto pelo histórico;
10. usuário sem entitlement bloqueado no PDF.


## Gate de performance

O Release Candidate deve passar em `npm run qa:performance` após `npm run build`. Falha no orçamento de performance bloqueia entrada no AI Studio/Staging.
