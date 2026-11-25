#!/usr/bin/env bash
# Envia a OpenObserve (stream "cicd_pipeline") un evento del pipeline por la API HTTP/JSON.
# Uso: evento-openobserve.sh <pruebas|despliegue> <success|failure|cancelled>
set -uo pipefail
ETAPA="$1"
ESTADO="$2"

if [ -z "${OO_URL:-}" ] || [ -z "${OO_AUTH:-}" ]; then
  echo "::warning::OO_URL u OO_AUTH no estan configurados; no se registra el evento"
  exit 0
fi

# Conteos de pruebas (si existen los reportes)
JEST=api/jest-resultados.json
PW=e2e/reporte-playwright/resultados.json
jest_ok=$(jq -r '.numPassedTests // 0' "$JEST" 2>/dev/null || echo 0)
jest_fail=$(jq -r '.numFailedTests // 0' "$JEST" 2>/dev/null || echo 0)
pw_ok=$(jq -r '.stats.expected // 0' "$PW" 2>/dev/null || echo 0)
pw_fail=$(jq -r '.stats.unexpected // 0' "$PW" 2>/dev/null || echo 0)
pw_flaky=$(jq -r '.stats.flaky // 0' "$PW" 2>/dev/null || echo 0)

[ "$ESTADO" = "success" ] && RESULTADO="exito" || RESULTADO="fallo"

evento() {
  jq -nc \
    --arg evento "$1" --arg estado "$2" --arg resultado "$3" --arg detalle "$4" \
    --arg commit "${GITHUB_SHA:-}" --arg rama "${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}" \
    --arg actor "${GITHUB_ACTOR:-}" --arg mensaje "${COMMIT_MSG:-}" \
    --arg repositorio "${GITHUB_REPOSITORY:-}" --arg workflow "${GITHUB_WORKFLOW:-}" \
    --arg disparador "${GITHUB_EVENT_NAME:-}" --arg destino "${DESTINO:-}" \
    --arg run_url "${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}" \
    --argjson run_id "${GITHUB_RUN_ID:-0}" --argjson run_numero "${GITHUB_RUN_NUMBER:-0}" \
    --argjson jest_ok "$jest_ok" --argjson jest_fallidas "$jest_fail" \
    --argjson playwright_ok "$pw_ok" --argjson playwright_fallidas "$pw_fail" --argjson playwright_inestables "$pw_flaky" \
    '{evento:$evento, estado:$estado, resultado:$resultado, detalle:$detalle, commit:$commit, commit_corto:$commit[0:7],
      rama:$rama, actor:$actor, mensaje_commit:$mensaje, repositorio:$repositorio, workflow:$workflow,
      disparador:$disparador, destino:$destino, run_id:$run_id, run_numero:$run_numero, run_url:$run_url,
      jest_ok:$jest_ok, jest_fallidas:$jest_fallidas, playwright_ok:$playwright_ok,
      playwright_fallidas:$playwright_fallidas, playwright_inestables:$playwright_inestables}'
}

if [ "$ETAPA" = "pruebas" ]; then
  EVENTOS="[$(evento pruebas "$ESTADO" "$RESULTADO" "Jest: $jest_ok ok / $jest_fail fallidas; Playwright: $pw_ok ok / $pw_fail fallidas / $pw_flaky inestables")"
  if [ "$RESULTADO" = "fallo" ] && [ "${GITHUB_EVENT_NAME:-}" = "push" ]; then
    # Incidente: las pruebas fallaron, el despliegue (SSH a EC2) queda bloqueado
    EVENTOS="$EVENTOS,$(evento despliegue_bloqueado "$ESTADO" fallo "Pruebas fallidas: el despliegue a EC2 no se ejecuta")"
  fi
  EVENTOS="$EVENTOS]"
else
  [ "$RESULTADO" = "exito" ] && DET="Contenedores actualizados en EC2" || DET="El despliegue en EC2 fallo"
  EVENTOS="[$(evento despliegue "$ESTADO" "$RESULTADO" "$DET")]"
fi

echo "$EVENTOS" | jq .
curl -sS -m 20 -X POST "${OO_URL%/}/api/default/cicd_pipeline/_json" \
  -H "Authorization: Basic $OO_AUTH" -H "Content-Type: application/json" -d "$EVENTOS" \
  || echo "::warning::No se pudo enviar el evento a OpenObserve"
echo
