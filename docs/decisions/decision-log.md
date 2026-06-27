# Decision Log — Vistoria Fácil IA

## 2026-06-27 — Protocolo Geral Floki

Decisão:
Adotar o PROTOCOLO_GERAL_FLOKI como regra operacional para todos os projetos.

Motivo:
Evitar execução reativa, patch-loop, perda de decisões, uso do Gustavo como QA básico e avanço sem invariantes.

Impacto:
Antes de qualquer ação técnica relevante, deve existir contrato ativo, invariantes, análise do todo, decisão técnica, próxima ação e check de desvio.

---

## 2026-06-27 — UAT manual só depois de UAT automatizado interno

Decisão:
Gustavo não deve receber UAT manual antes de uma fase automatizada real que simule o usuário.

Motivo:
UAT manual deve validar produto e experiência, não descobrir bugs básicos.

---

## 2026-06-27 — Custo zero primeiro

Decisão:
Qualquer chamada OpenAI, uso de serviço pago ou envio de dado real para terceiros exige autorização explícita.

---

## 2026-06-27 — Invariantes app-wide

Decisão:
Não corrigir apenas sintomas isolados. Quando houver risco sistêmico, mapear invariantes do app inteiro antes de patch.

---

## 2026-06-27 — Vistoria Fácil IA: P0 atual

Decisão:
O P0 atual é garantir persistência real, ciclo de vida confiável, histórico/rascunho correto e navegação funcional antes de avançar para IA, relatório, pricing ou produção.
