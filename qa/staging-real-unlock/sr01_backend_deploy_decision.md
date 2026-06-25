# SR-01 - Backend Deploy Decision

## Decisao

Usar Cloud Run para o backend staging.

## Motivo

O projeto possui `server.ts` com Express/endpoints `/api`. Firebase Hosting estatico nao executa esse backend. Para validar staging real, o frontend publicado em Hosting precisa chamar um backend real publicado em ambiente controlado.

## Modelo alvo

```text
Firebase Hosting staging
  /         -> dist frontend
  /api/**   -> rewrite para Cloud Run service

Cloud Run
  service: vistoria-facil-api-staging
  region: southamerica-east1
  env: SERVER_ENV=staging
```

## Requisitos

- `Dockerfile` ou build equivalente para `server.ts`.
- Rota `/api/health` respondendo sem credencial sensivel.
- CORS limitado a `ALLOWED_ORIGINS_STAGING`.
- Firebase Admin inicializado por service account/ADC.
- Secrets via Secret Manager ou env refs, nunca em arquivo.
- Logs sem prompt secreto, token, service account ou dados pessoais desnecessarios.
- Mercado Pago em sandbox.
- IA em modo staging conforme contrato.

## Firebase Hosting rewrite

`firebase.json` deve conter:

```json
{
  "source": "/api/**",
  "run": {
    "serviceId": "vistoria-facil-api-staging",
    "region": "southamerica-east1"
  }
}
```

## Alternativas rejeitadas

- Hosting estatico apenas: rejeitado porque nao cobre `/api`.
- Rodar backend local para UAT: rejeitado porque nao prova staging real.
- Cloud Functions sem avaliacao: adiado; Cloud Run encaixa melhor no `server.ts`/Express atual.

## DoD backend staging

- Cloud Run deploy concluido.
- Service URL capturada.
- `/api/health` responde 200.
- `/api/health` via Firebase Hosting rewrite responde 200.
- Backend consegue acessar Firebase Admin em staging.
- Backend nao acessa producao.
- Logs redigidos.
- Evidencias anexadas em `staging_real_evidence_<timestamp>.md`.

