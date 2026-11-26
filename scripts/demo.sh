#!/usr/bin/env bash
# Demostracion en clase del pipeline CI/CD.
#   bash scripts/demo.sh exito     -> cambio valido: pasan las pruebas y se despliega en EC2 (criterio 2)
#   bash scripts/demo.sh error     -> error intencional: Playwright falla y el despliegue se bloquea (criterio 1)
#   bash scripts/demo.sh corregir  -> quita el error intencional y vuelve a desplegar
set -euo pipefail
cd "$(dirname "$0")/.."

REPO=https://github.com/monteswastakenn/proyecto-parcial2-cicd
APP=http://3.16.70.203
OO=http://3.16.70.203:6061
JS=web/public/app.js
modo=${1:-}

case "$modo" in
  exito)
    hora=$(date '+%d/%m/%Y %H:%M')
    if grep -q '^Última demostración en clase:' README.md; then
      sed -i.bak "s|^Última demostración en clase:.*|Última demostración en clase: $hora|" README.md && rm -f README.md.bak
    else
      printf '\nÚltima demostración en clase: %s\n' "$hora" >> README.md
    fi
    git add README.md
    git commit -q -m "Demostracion en clase ($hora): cambio valido"
    ;;
  error)
    sed -i.bak 's/Number(reg\[campo\]).toFixed(2)/Number(reg[campo]).toFixed(0)/' "$JS" && rm -f "$JS.bak"
    git add "$JS"
    git commit -q -m "ERROR INTENCIONAL (demostracion): el precio se muestra sin centavos"
    ;;
  corregir)
    sed -i.bak 's/Number(reg\[campo\]).toFixed(0)/Number(reg[campo]).toFixed(2)/' "$JS" && rm -f "$JS.bak"
    git add "$JS"
    git commit -q -m "Corrige el error intencional: el precio vuelve a mostrar dos decimales"
    ;;
  *)
    echo "Uso: bash scripts/demo.sh exito | error | corregir"; exit 1 ;;
esac

commit=$(git rev-parse --short HEAD)
sha=$(git rev-parse HEAD)
echo "Commit $commit creado. Haciendo push..."
git push -q

echo "Esperando a que GitHub Actions arranque el pipeline..."
id=""
for _ in $(seq 1 30); do
  id=$(gh run list --commit "$sha" --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
  [ -n "$id" ] && break
  sleep 2
done
if [ -z "$id" ]; then
  echo "No encontre la ejecucion todavia. Abrela en: $REPO/actions"; open "$REPO/actions" 2>/dev/null || true; exit 0
fi

echo "Ejecucion: $REPO/actions/runs/$id"
open "$REPO/actions/runs/$id" 2>/dev/null || true
echo
echo "================  PIPELINE EN VIVO (se actualiza solo)  ================"
gh run watch "$id" --interval 3 || true

echo
echo "================  RESULTADO  ================"
gh run view "$id" --json jobs -q '.jobs[]|"  \(.name): \(.conclusion)"'

if [ "$modo" = error ]; then
  echo
  echo "================  LOG DEL FALLO (Playwright)  ================"
  gh run view "$id" --log 2>/dev/null \
    | grep -E "Pruebas E2E|Pruebas de backend|Validar resultado" \
    | sed -E 's/^.*Z //' \
    | grep -E "✘|Expected:|Received:|^ *[0-9]+ (passed|failed)|^Tests:|^Jest: " \
    | grep -v "test-results/" | head -30 || true
  echo
  echo "El despliegue quedo OMITIDO: nunca se abrio la conexion SSH a EC2."
  echo "El servidor sigue con la version anterior:"
  curl -s -m 10 "$APP/api/health"; echo
  echo
  echo "Mostrar en OpenObserve: $OO -> Dashboards -> '3. Pipeline CI/CD' (pruebas: fallo y despliegue_bloqueado)"
  echo "                         y Alertas -> pipeline_fallido (se dispara en ~1 minuto)."
  echo "Para dejarlo bien: bash scripts/demo.sh corregir"
else
  echo
  echo "Version que reporta ahora el servidor:"
  curl -s -m 10 "$APP/api/health"; echo
  echo
  echo "Recarga $APP : el pie dice 'Version desplegada: $commit'"
  echo "OpenObserve: $OO -> Dashboards -> '3. Pipeline CI/CD' o '5. Vista unificada'"
fi
