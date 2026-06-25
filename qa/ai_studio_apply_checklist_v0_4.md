# Checklist Aplicação AI Studio — Vistoria Fácil IA V0.4.0-rc2

Usar como lista operacional rápida. O runbook detalhado é `qa/aistudio_staging_runbook_v0_4.md`.

## Antes de abrir AI Studio

- [ ] ZIP fonte RC salvo.
- [ ] Notas/diff dos patches salvos.
- [ ] `npm run lint` OK.
- [ ] `npm run test:ci` OK.
- [ ] `npm run build` OK.
- [ ] `npm run qa:rc` OK.
- [ ] `npm run qa:staging` OK.
- [ ] `npm run qa:performance` OK.
- [ ] Runbook lido.
- [ ] Tempo mínimo de 45–60 min reservado.

## Ao abrir AI Studio

- [ ] Confirmar limite diário disponível.
- [ ] Exportar backup atual.
- [ ] Confirmar backup baixado e abrível.
- [ ] Aplicar fonte em staging/cópia.
- [ ] Configurar envs sem expor segredo.
- [ ] Não ativar produção.

## Depois de aplicar

- [ ] Login real testado.
- [ ] Plano gratuito testado.
- [ ] Plano pago sandbox aprovado testado.
- [ ] Pagamento pendente/recusado testado.
- [ ] Entitlement validado.
- [ ] Imóvel persiste.
- [ ] Vistoria persiste.
- [ ] Cômodos persistem.
- [ ] Fotos persistem.
- [ ] Gate de qualidade bloqueia casos inválidos.
- [ ] PDF persistente testado.
- [ ] Histórico reabre vistoria/PDF.
- [ ] Isolamento de usuário testado.
- [ ] Evidência preenchida.

## Decisão

- [ ] PASS para RC/UAT.
- [ ] BLOCKED para correção local.
- [ ] ROLLBACK.
