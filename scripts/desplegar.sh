#!/usr/bin/env bash
# Se ejecuta en la instancia EC2 (via SSH desde GitHub Actions).
# Actualiza el codigo a la ultima version de main y recrea los contenedores.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Actualizando codigo"
git fetch --quiet origin main
git reset --hard origin/main

export APP_VERSION="${1:-$(git rev-parse HEAD)}"
APP_VERSION="${APP_VERSION:0:7}"
echo "==> Version $APP_VERSION"

echo "==> Construyendo y actualizando contenedores"
docker compose --profile observabilidad up -d --build --remove-orphans

echo "==> Esperando a que la API responda"
for i in $(seq 1 40); do
  if curl -fsS http://localhost/api/health >/dev/null 2>&1; then
    curl -fsS http://localhost/api/health; echo
    docker image prune -f >/dev/null
    docker compose --profile observabilidad ps --format "table {{.Name}}\t{{.Status}}"
    exit 0
  fi
  sleep 3
done
echo "La API no respondio a tiempo" >&2
docker compose logs --tail=80 api >&2
exit 1
