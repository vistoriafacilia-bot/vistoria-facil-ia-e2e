# VF Real Public Auth Signup UAT - 2026-06-26

Status: FAIL

URL testada: https://glittery-boba-2b3367.netlify.app
Run ID: uat_signup_1782494707115
Inicio: 2026-06-26T17:25:07.115Z
Fim: 2026-06-26T17:25:29.661Z

## Autenticacao publica

- Google login oculto: PASS
- Entrar visivel: NOT_RUN
- Criar conta visivel: NOT_RUN
- Login com e-mail inexistente: NOT_RUN
- Criar conta: NOT_RUN
- Politica de e-mail tecnico: Supabase Auth rejeita TLD .test no signup publico; gate usa dominio valido vistoriafacilia.com.
- Login apos criacao: NOT_RUN
- Esqueci minha senha: NOT_RUN
- Confirmacao de e-mail bloqueia fluxo: nao

## Fluxo principal pos-login

- Criar local/imovel: NOT_RUN
- Criar vistoria: NOT_RUN
- Criar comodo: NOT_RUN
- Upload/foto/revisao: NOT_RUN
- Concluir/Revisar: NOT_RUN
- Persistencia/retomada: NOT_RUN

## Runtime

- Console errors criticos: 0
- Page errors: 0
- Failed requests criticos: 0
- Failed requests esperados no login invalido: 0

## Cleanup

- Cleanup: PASS
- Leftovers: {}

## Decisao

UAT manual permanece bloqueado ate resolver o item registrado.

Erro: locator.waitFor: Timeout 20000ms exceeded. Call log: [2m - waiting for getByRole('button', { name: /Criar conta/i }).first() to be visible[22m 
