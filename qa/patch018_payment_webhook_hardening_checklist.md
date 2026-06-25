# Patch018 — Checklist E2E de Pagamento / Webhook / Entitlement

Status: preparado localmente. Não aplicar em UAT sem execução controlada no ambiente alvo.

## Objetivo
Validar que o acesso pago só é liberado quando o pagamento aprovado passa também por validação de ordem, usuário, plano, valor e moeda.

## Pré-condições
- `MERCADOPAGO_ACCESS_TOKEN` configurado somente em ambiente de teste/staging.
'- `APP_URL` apontando para URL pública do ambiente, para receber webhook.
- Firestore acessível pelo backend.
- Usuário autenticado no app.
- AI Studio preservado até aplicação única do patch consolidado.

## Cenários manuais obrigatórios

### PAY-E2E-018-01 — Plano gratuito
1. Login.
2. Selecionar plano gratuito.
3. Confirmar entitlement ativo `free_10`.
4. Confirmar limite de 10 fotos.

Aceite: app libera uso sem pagamento e mantém limite gratuito.

### PAY-E2E-018-02 — Checkout pago criado
1. Login.
2. Selecionar plano pago.
3. Confirmar criação de `orders/{orderId}`.
4. Confirmar redirecionamento para checkout.

Aceite: pedido fica `pending`, com `preferenceId` e `checkoutUrl`.

### PAY-E2E-018-03 — Pagamento aprovado válido
1. Concluir pagamento Pix/cartão sandbox.
2. Aguardar webhook.
3. Confirmar `payments/{paymentId}` com `validationStatus=passed`.
4. Confirmar `orders/{orderId}.status=approved`.
5. Confirmar `entitlements/{userId}_beta_paid_4990.status=active`.

Aceite: acesso pago liberado e limite de 50 fotos ativo.

### PAY-E2E-018-04 — Retorno success sem webhook imediato
1. Voltar ao app via URL de sucesso.
2. Verificar mensagem de espera.
3. Confirmar que o app não libera acesso sem entitlement ativo.
4. Clicar em “Já paguei, verificar liberação”.

Aceite: retorno de tela não libera sozinho; apenas entitlement libera.

### PAY-E2E-018-05 — Pagamento pendente
1. Simular pagamento pendente.
2. Confirmar que `orders.status=pending`.
3. Confirmar que nenhum entitlement pago é criado.

Aceite: sem liberação paga.

### PAY-E2E-018-06 — Pagamento aprovado com valor divergente
1. Simular/forçar payload de pagamento aprovado com valor diferente da ordem.
2. Confirmar `payment.validationStatus=blocked`.
3. Confirmar `order.status=payment_validation_blocked`.
4. Confirmar que nenhum entitlement é criado.

Aceite: pagamento aprovado pelo provedor, mas inconsistente, não libera acesso.

### PAY-E2E-018-07 — Webhook duplicado
1. Reenviar mesmo webhook.
2. Confirmar que `webhook_events` usa id determinístico.
3. Confirmar que entitlement não duplica.

Aceite: reexecução idempotente.

### PAY-E2E-018-08 — Usuário A x Usuário B
1. Usuário A paga.
2. Usuário B faz login.
3. Usuário B não pode ver ordem/pagamento/entitlement de A.

Aceite: isolamento preservado.
