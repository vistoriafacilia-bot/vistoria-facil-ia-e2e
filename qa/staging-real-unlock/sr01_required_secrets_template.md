# SR-01 - Required Secrets Template

Este arquivo lista nomes e finalidade. Nao inserir valores reais neste arquivo.

## Regras

- Nunca colar token no chat.
- Nunca commitar `.env` real.
- Nunca imprimir secret em log ou evidencia.
- Preferir GitHub Actions environment secrets.
- Preferir service account / ADC para Firebase/GCP.
- Redigir qualquer output antes de anexar evidencia.

## GitHub

| Nome | Obrigatorio | Armazenamento | Finalidade |
| --- | --- | --- | --- |
| `GITHUB_REMOTE_AUTH_METHOD` | sim | runbook seguro | `pat` ou `ssh` |
| `GITHUB_PAT_REF` | condicional | secret manager / GitHub secret | push HTTPS |
| `SSH_KEY_REF` | condicional | secret manager / GitHub deploy key | push SSH |
| `GH_REPO_URL` | sim | config nao secreta | URL do repositorio |
| `GH_ENVIRONMENT` | sim | GitHub environment | deve ser `staging` |

## Firebase/GCP

| Nome | Obrigatorio | Armazenamento | Finalidade |
| --- | --- | --- | --- |
| `FIREBASE_PROJECT_ID_STAGING` | sim | GitHub secret ou variable | projeto Firebase staging |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON_REF` | sim | secret manager / GitHub secret | ADC no CI |
| `FIREBASE_SERVICE_ACCOUNT_REF` | sim | secret manager / GitHub secret | deploy Firebase |
| `GCP_PROJECT_ID` | sim | GitHub variable/secret | projeto GCP |
| `GCP_REGION` | sim | GitHub variable | regiao Cloud Run |
| `CLOUD_RUN_SERVICE_NAME` | sim | GitHub variable | servico backend staging |
| `FIREBASE_HOSTING_SITE` | sim | GitHub variable | site Hosting staging |
| `FIREBASE_TOKEN` | nao recomendado | evitar | usar apenas se ADC nao estiver disponivel |

## Frontend

| Nome | Obrigatorio | Armazenamento | Finalidade |
| --- | --- | --- | --- |
| `VITE_FIREBASE_API_KEY_STAGING` | sim | GitHub secret | Firebase Web App |
| `VITE_FIREBASE_AUTH_DOMAIN_STAGING` | sim | GitHub variable/secret | Auth domain |
| `VITE_FIREBASE_PROJECT_ID_STAGING` | sim | GitHub variable | project id |
| `VITE_FIREBASE_STORAGE_BUCKET_STAGING` | sim | GitHub variable | bucket staging |
| `VITE_FIREBASE_MESSAGING_SENDER_ID_STAGING` | sim | GitHub variable/secret | Firebase Web App |
| `VITE_FIREBASE_APP_ID_STAGING` | sim | GitHub variable/secret | Firebase Web App |
| `VITE_API_BASE_URL_STAGING` | sim | GitHub variable | base URL do backend |
| `VITE_E2E_MODE` | condicional | GitHub variable | permitido apenas para harness controlado; aceite real deve rodar sem mock enganoso |

## Auth E2E

| Nome | Obrigatorio | Armazenamento | Finalidade |
| --- | --- | --- | --- |
| `E2E_TEST_USER_EMAIL_REF` | sim | GitHub secret | usuario teste |
| `E2E_TEST_USER_PASSWORD_REF` | sim | GitHub secret | senha teste |
| `E2E_AUTH_STRATEGY` | sim | GitHub variable | `email_password` ou `custom_token` |
| `E2E_CUSTOM_TOKEN_SECRET_REF` | condicional | GitHub secret | header/secret se custom token for usado |
| `E2E_AUTH_ENABLED` | sim | GitHub variable | `true` somente em staging/test |

## Backend

| Nome | Obrigatorio | Armazenamento | Finalidade |
| --- | --- | --- | --- |
| `SERVER_ENV` | sim | Cloud Run env | deve ser `staging` |
| `AI_PROVIDER` | sim | Cloud Run env | provedor IA |
| `AI_API_KEY_REF` | sim | secret manager | chave IA |
| `FIREBASE_ADMIN_CREDENTIALS_REF` | sim | secret manager | Admin SDK |
| `STORAGE_BUCKET_STAGING` | sim | Cloud Run env | bucket |
| `ALLOWED_ORIGINS_STAGING` | sim | Cloud Run env | CORS |

## Mercado Pago

| Nome | Obrigatorio | Armazenamento | Finalidade |
| --- | --- | --- | --- |
| `MP_ACCESS_TOKEN_SANDBOX_REF` | sim | secret manager / GitHub secret | API sandbox |
| `MP_PUBLIC_KEY_SANDBOX` | sim | GitHub variable/secret | checkout sandbox |
| `MP_WEBHOOK_SECRET_REF` | sim | secret manager | validar webhook |
| `MP_SUCCESS_URL_STAGING` | sim | GitHub variable | retorno sucesso |
| `MP_FAILURE_URL_STAGING` | sim | GitHub variable | retorno falha |
| `MP_PENDING_URL_STAGING` | sim | GitHub variable | retorno pendente |

## Checklist de redacao

- Substituir tokens por `***REDACTED***`.
- Nao anexar JSON bruto de service account.
- Nao anexar `storageState` se contiver cookies/tokens.
- Nao anexar payload Mercado Pago com access token.
- Evidenciar apenas nomes de secrets, hashes, status e URLs publicas de staging.

