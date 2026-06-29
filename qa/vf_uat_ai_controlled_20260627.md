# VF UAT IA Controlada - 3 Fotos Reais - 2026-06-27

STATUS FINAL: COST_GUARD

URL testada: https://glittery-boba-2b3367.netlify.app
Run ID: ai_controlled_1782603292355
Inicio: 2026-06-27T23:34:52.355Z
Fim: 2026-06-27T23:34:56.800Z

## Limite de Custo

- Dataset aprovado: qa/vf_ai_dataset_selection_3photos_20260627.json
- Status do dataset: DATASET_3PHOTOS_APPROVED_FOR_1F
- Fotos maximas permitidas: 3
- Fotos selecionadas: 3
- Base aprovada: R$ 0.45
- Stress aprovado: R$ 0.75
- Custo estimado executado base: R$ 0.00
- Custo estimado executado stress: R$ 0.00
- Requests IA observados: 0
- Tokens totais: 0

## Matriz

| Fase | Caso | Esperado | Status | Evidencia |
| --- | --- | --- | --- | --- |
| 0 | Governanca do dataset aprovado | Usar exclusivamente qa/vf_ai_dataset_selection_20260627.json | PASS | 3 fotos aprovadas; 3 comodos; OpenAI=0 antes do upload |

## Fotos por Comodo

| Comodo | Foto | Status IA | Condicao | Confianca | Sugestao util |
| --- | --- | --- | --- | --- | --- |

## Gaps

- Nenhum gap registrado.

## Bugs/Bloqueios

- Amostra invalida: rooms=3, photos=3

## Cleanup

- Cleanup total: nao
- Leftovers: nao executado

UAT nao foi liberado automaticamente.
