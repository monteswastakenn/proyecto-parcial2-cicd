# Proyecto Parcial 2 — CI/CD, pruebas automatizadas y observabilidad

Sistema web de inventario (**login, CRUD de usuarios y CRUD de productos**) con:

- **Pruebas automatizadas** de backend (Jest + Supertest) y de extremo a extremo de API y frontend (Playwright).
- **CI/CD con GitHub Actions**: si todas las pruebas pasan, se despliega automáticamente en **AWS EC2** por SSH; si alguna falla, el despliegue se bloquea.
- **Observabilidad con OpenObserve**: eventos del pipeline (API HTTP/JSON), logs, métricas y trazas de la aplicación (OpenTelemetry/OTLP) y recursos del servidor (OpenTelemetry Collector).

| Recurso | URL |
|---|---|
| Aplicación | http://3.16.70.203 |
| OpenObserve | http://3.16.70.203:6061 |

## Arquitectura

```
GitHub (push a main)
  └─ GitHub Actions
       ├─ job "pruebas":  docker compose up → Jest (52) → Playwright API + frontend
       │                  └─ evento "pruebas" (y "despliegue_bloqueado" si falla) → OpenObserve
       └─ job "despliegue" (needs: pruebas): SSH a EC2 → scripts/desplegar.sh → health check
                          └─ evento "despliegue" → OpenObserve

AWS EC2 (Ubuntu 24.04, Docker Compose)
  web (nginx) ─► api (Node/Express) ─► auditoria (Node/Express) ─► PostgreSQL
                    │ OTLP                 │ OTLP
                    └──────► otel-collector ◄┘  + hostmetrics (CPU, RAM, red, disco)
                                 │
                                 ▼
                            OpenObserve  ◄── sensores (temperatura)  ◄── GitHub Actions (eventos CI/CD)
```

## Estructura

| Carpeta | Contenido |
|---|---|
| `api/` | API REST (Express 5, PostgreSQL, JWT, bcrypt) instrumentada con OpenTelemetry; pruebas Jest en `api/tests` |
| `auditoria/` | Microservicio que registra cada alta, edición y baja (permite ver trazas distribuidas entre servicios) |
| `web/` | Frontend (HTML/CSS/JS) servido por nginx, que también hace de proxy de `/api` |
| `e2e/` | Pruebas Playwright: proyecto `api` (endpoints) y proyecto `web` (interfaz) |
| `otel/` | Configuración del OpenTelemetry Collector |
| `monitoring/` | Script de sensores de temperatura y definición de tableros/alertas |
| `scripts/` | Despliegue en EC2 y envío de eventos del pipeline a OpenObserve |
| `.github/workflows/ci-cd.yml` | Pipeline CI/CD |

## Ejecutar en local

```bash
docker compose up -d --build --wait db auditoria api web     # http://localhost
cd api && npm ci && DATABASE_URL=postgres://app:app@localhost:5432/app npm test
cd e2e && npm ci && npx playwright install chromium && npx playwright test
```

Con observabilidad completa (OpenObserve en http://localhost:6061):

```bash
cp .env.ejemplo .env   # llenar valores
docker compose --profile observabilidad up -d --build
```

## Secretos del repositorio (GitHub Actions)

| Secreto | Uso |
|---|---|
| `EC2_HOST` | IP pública de la instancia |
| `EC2_SSH_KEY` | Llave privada de despliegue (usuario `ubuntu`) |
| `OO_URL` | URL de OpenObserve, p. ej. `http://3.16.70.203:6061` |
| `OO_AUTH` | `base64("usuario:contraseña")` de OpenObserve |
