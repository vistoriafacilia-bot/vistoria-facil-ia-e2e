# Performance Budget V0.4 — Vistoria Fácil IA

## Objetivo

Evitar que a primeira versão paga do app nasça lenta por excesso de bundle inicial.

## Regra

O app deve usar code splitting/manual chunks para separar dependências pesadas do bundle principal.

## Gate local

Executar:

```bash
npm run build
npm run qa:performance
```

## Critérios mínimos

- chunk principal `index-*.js` <= 650 KB;
- maior chunk JS <= 900 KB;
- chunks manuais obrigatórios presentes:
  - `vendor-react`;
  - `vendor-firebase`;
  - `vendor-ui`;
- qualquer chunk acima de 500 KB vira monitoramento explícito;
- alerta de performance não pode ser ignorado sem registro.

## Decisão

Este gate não substitui teste real de rede, mas bloqueia crescimento descontrolado do bundle antes de abrir AI Studio/Staging.
