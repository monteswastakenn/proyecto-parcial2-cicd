#!/usr/bin/env bash
# Genera peticiones reales contra el sistema desplegado para ver moverse las graficas de OpenObserve.
#   bash scripts/trafico.sh            -> 2 minutos de trafico normal (con algunos errores 401/404)
#   bash scripts/trafico.sh 300        -> 5 minutos
#   bash scripts/trafico.sh 120 errores -> mas errores, para que suba la tasa de error y se dispare la alerta
set -uo pipefail

APP=${APP:-http://3.16.70.203}
OO=http://3.16.70.203:6061
DURACION=${1:-120}
MODO=${2:-normal}
HILOS=4   # peticiones en paralelo (moderado: la instancia es t3.micro)

token=$(curl -s -m 10 -X POST "$APP/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@proyecto.com","password":"Admin123!"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
if [ -z "$token" ] || [ "${#token}" -lt 20 ]; then echo "No se pudo iniciar sesion en $APP"; exit 1; fi
AUTH="Authorization: Bearer $token"

echo "Generando trafico contra $APP durante $DURACION s ($HILOS en paralelo, modo $MODO)."
echo "Se abre OpenObserve en el tablero '1. Aplicación: endpoints' (se actualiza solo cada 10 s;"
echo "las metricas llegan cada ~15 s, asi que las graficas suben a los 20-30 s de empezar)."
# Tablero "1. Aplicación: endpoints" con los ultimos 15 minutos y actualizacion automatica cada 10 s.
# (Si se vuelve a ejecutar monitoring/tableros.py el ID cambia: entonces abrelo desde el menu Dashboards.)
TABLERO="$OO/web/dashboards/view?org_identifier=default&dashboard=7531424630733537280&folder=default&period=15m&refresh=10s"
[ -z "${NO_ABRIR:-}" ] && open "$TABLERO" 2>/dev/null
echo

pide() { curl -s -o /dev/null -w '%{http_code}' -m 10 "$@"; }

trabajador() {
  local n=$1 fin=$(( $(date +%s) + DURACION )) i=0 sku id
  while [ "$(date +%s)" -lt "$fin" ]; do
    i=$((i + 1))
    pide "$APP/api/health" >/dev/null
    pide -H "$AUTH" "$APP/api/productos" >/dev/null
    pide -H "$AUTH" "$APP/api/usuarios?q=admin" >/dev/null
    pide -H "$AUTH" "$APP/api/productos?q=demo" >/dev/null
    # alta, edicion y baja de un producto (genera trazas api -> auditoria -> PostgreSQL)
    sku="DEMO-$n-$i-$RANDOM"
    id=$(curl -s -m 10 -X POST "$APP/api/productos" -H "$AUTH" -H 'Content-Type: application/json' \
      -d "{\"sku\":\"$sku\",\"nombre\":\"Producto demo $i\",\"precio\":$((RANDOM % 900 + 100)).50,\"stock\":$((RANDOM % 50))}" \
      | sed -nE 's/.*"id":([0-9]+).*/\1/p')
    if [ -n "$id" ]; then
      pide -X PUT "$APP/api/productos/$id" -H "$AUTH" -H 'Content-Type: application/json' \
        -d "{\"sku\":\"$sku\",\"nombre\":\"Producto demo $i editado\",\"precio\":99.99,\"stock\":1}" >/dev/null
      pide -X DELETE "$APP/api/productos/$id" -H "$AUTH" >/dev/null
    fi
    # algunos errores para las graficas de errores por endpoint y statusCode
    if [ $((i % 3)) -eq 0 ] || [ "$MODO" = errores ]; then
      pide "$APP/api/productos" >/dev/null                                  # 401 sin token
      pide -H "$AUTH" "$APP/api/productos/999999" >/dev/null                # 404
      pide -X POST "$APP/api/auth/login" -H 'Content-Type: application/json' \
        -d '{"email":"admin@proyecto.com","password":"incorrecta"}' >/dev/null  # 401 login fallido
    fi
    if [ "$MODO" = errores ]; then
      pide "$APP/api/no-existe" >/dev/null                                  # 404
      pide -X POST "$APP/api/productos" -H "$AUTH" -H 'Content-Type: application/json' -d '{"sku":""}' >/dev/null  # 400
    fi
  done
  echo "  hilo $n: $i rondas"
}

inicio=$(date +%s)
for n in $(seq 1 $HILOS); do trabajador "$n" & done
while [ $(( $(date +%s) - inicio )) -lt "$DURACION" ]; do
  sleep 10
  printf '  %3ss / %ss  -> %s\n' "$(( $(date +%s) - inicio ))" "$DURACION" "$(curl -s -m 5 "$APP/api/health")"
done
wait
echo
echo "Listo. En OpenObserve revisa:"
echo "  - '1. Aplicación: endpoints': peticiones/s, latencia p95 y errores por endpoint y statusCode"
echo "  - '2. Servidor EC2' o '5. Vista unificada': CPU, RAM y ancho de banda de la instancia"
echo "  - Menu Trazas: trazas de POST /api/productos (api -> PostgreSQL -> auditoria -> PostgreSQL)"
