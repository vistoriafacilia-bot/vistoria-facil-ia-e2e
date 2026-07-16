# Ambientes

## DEV

- Execução local.
- Dados fictícios.
- Supabase local ou ambiente DEV controlado.
- IA mock por padrão.
- Nenhuma credencial de produção.

## HMLG

- Site Netlify separado.
- Branch `hmlg`.
- Projeto Supabase separado.
- Asaas Sandbox.
- Dados fictícios.
- IA mock por padrão.
- Chamadas reais somente em gate controlado.
- Custo zero ou próximo de zero.

## PROD

- Site Netlify atual.
- Branch `main`.
- Supabase PROD.
- Asaas PROD.
- Dados reais.
- Alterações somente por promoção aprovada.
