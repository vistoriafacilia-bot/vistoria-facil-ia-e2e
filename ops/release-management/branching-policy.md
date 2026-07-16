# Política de Branches

Fluxo de promoção:

```text
feature/* ou devops/*
-> hmlg
-> main
```

## Regras

- Não desenvolver diretamente em `main`.
- Não desenvolver diretamente em `hmlg`.
- Toda feature entra primeiro em HMLG.
- A mesma versão aprovada em HMLG deve ser promovida para PROD.
- Hotfix parte do commit atual de PROD.
- Hotfix deve voltar depois para HMLG e branches ativas.
- Commits não publicados não podem ser incorporados automaticamente.
