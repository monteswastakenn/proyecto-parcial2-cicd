#!/bin/sh
# Lee cada 30 s los sensores de temperatura que expone el kernel (hwmon y thermal_zone)
# y los envia a OpenObserve (stream "temperatura_servidor") por la API HTTP/JSON.
# En EC2 el hipervisor Nitro no expone la temperatura de la CPU; el unico sensor visible es el
# del disco NVMe. Si la lectura no es valida (p. ej. -273.15 C) se marca con valido=false.
while true; do
  datos=""
  for f in /host/sys/class/hwmon/hwmon*/temp*_input /host/sys/class/thermal/thermal_zone*/temp; do
    [ -r "$f" ] || continue
    dir=$(dirname "$f")
    nombre=$(cat "$dir/name" 2>/dev/null || cat "$dir/type" 2>/dev/null || echo desconocido)
    crudo=$(cat "$f" 2>/dev/null) || continue
    celsius=$(awk -v v="$crudo" 'BEGIN { printf "%.2f", v / 1000 }')
    valido=$(awk -v c="$celsius" 'BEGIN { print (c > -50 && c < 150) ? "true" : "false" }')
    registro="{\"sensor\":\"$nombre\",\"archivo\":\"${f#/host}\",\"celsius\":$celsius,\"valido\":$valido,\"host\":\"$(hostname)\"}"
    datos="${datos:+$datos,}$registro"
  done
  [ -z "$datos" ] && datos="{\"sensor\":\"ninguno\",\"celsius\":null,\"valido\":false,\"host\":\"$(hostname)\"}"
  curl -s -o /dev/null -m 10 -X POST "$OO_ENDPOINT/temperatura_servidor/_json" \
    -H "Authorization: Basic $OO_AUTH" -H 'Content-Type: application/json' -d "[$datos]" || true
  sleep 30
done
