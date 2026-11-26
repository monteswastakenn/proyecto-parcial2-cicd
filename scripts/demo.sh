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
echo "Commit $commit creado. Haciendo push..."
git push -q
echo
echo "Listo. Abriendo GitHub Actions (la ejecucion nueva aparece hasta arriba en unos segundos)."
open "$REPO/actions" 2>/dev/null || true
echo
echo "Que mostrar:"
echo "  1. GitHub Actions: $REPO/actions  -> clic en la ejecucion de arriba"
if [ "$modo" = error ]; then
  echo "     'Pruebas' termina en rojo y 'Despliegue en AWS EC2' queda omitido (gris)."
  echo "  2. El sistema sigue con la version anterior: $APP (pie de pagina)"
  echo "  3. OpenObserve: $OO -> Dashboards -> '3. Pipeline CI/CD' (pruebas: fallo y despliegue_bloqueado)"
  echo "     y Alertas -> pipeline_fallido. Despues ejecuta: bash scripts/demo.sh corregir"
else
  echo "     Primero 'Pruebas' (~1 min) y luego 'Despliegue en AWS EC2' (~1 min), ambos en verde."
  echo "  2. Al terminar, recarga $APP : el pie dice 'Version desplegada: $commit'"
  echo "  3. OpenObserve: $OO -> Dashboards -> '3. Pipeline CI/CD' o '5. Vista unificada'"
fi
