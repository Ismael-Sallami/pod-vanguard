#!/usr/bin/env bash
# ==============================================================================
# PodVanguard - Script de Gestión de Entorno de Prueba Local
# Autor: Ismael Sallami Moreno
#
# Permite levantar, monitorear y apagar un clúster simulado de microservicios
# en Docker para explorar todas las capacidades de PodVanguard:
# - Monitor de contenedores en tiempo real
# - Topología de red vectorial (redes bridge, puertos y volúmenes)
# - Auditor de seguridad Sentinel Shield (detección de fugas y límites OOM)
# - Consola PTY interactiva sobre WebSockets
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.demo.yml"

# Colores terminal
COLOR_RESET="\033[0m"
COLOR_BOLD="\033[1m"
COLOR_ACCENT="\033[38;5;208m"
COLOR_GREEN="\033[38;5;48m"
COLOR_CYAN="\033[38;5;51m"
COLOR_AMBER="\033[38;5;214m"

print_header() {
  echo -e "${COLOR_ACCENT}${COLOR_BOLD}"
  echo "  ================================================================"
  echo "    PODVANGUARD :: ENTORNO DE PRUEBAS LOCAL PARA DOCKER & K8S"
  echo "  ================================================================"
  echo -e "${COLOR_RESET}"
}

check_docker() {
  if ! command -v docker &> /dev/null; then
    echo -e "${COLOR_AMBER}Error: Docker no está instalado o no se encuentra en el PATH.${COLOR_RESET}"
    exit 1
  fi
  if ! docker info &> /dev/null; then
    echo -e "${COLOR_AMBER}Error: El socket de Docker no responde. Asegúrate de que el demonio está activo.${COLOR_RESET}"
    exit 1
  fi
}

start_env() {
  print_header
  check_docker
  echo -e "  ${COLOR_CYAN}[+] Levantando servicios de prueba (api-gateway, auth-service, cache-redis, worker-queue)...${COLOR_RESET}"
  
  if docker compose version &> /dev/null; then
    docker compose -f "${COMPOSE_FILE}" up -d
  else
    docker-compose -f "${COMPOSE_FILE}" up -d
  fi

  echo ""
  echo -e "  ${COLOR_GREEN}✓ Entorno desplegado con éxito.${COLOR_RESET}"
  echo ""
  show_status
  echo ""
  echo -e "  ${COLOR_BOLD}Para abrir el centro de mando PodVanguard:${COLOR_RESET}"
  echo -e "    ${COLOR_ACCENT}pv --open${COLOR_RESET}   (o bien: ${COLOR_ACCENT}pod-vanguard --open${COLOR_RESET})"
  echo ""
  echo -e "  ${COLOR_BOLD}Para detener el entorno cuando termines:${COLOR_RESET}"
  echo -e "    ${COLOR_ACCENT}./demo-env.sh stop${COLOR_RESET}"
  echo ""
}

stop_env() {
  print_header
  check_docker
  echo -e "  ${COLOR_AMBER}[-] Deteniendo y eliminando contenedores de prueba...${COLOR_RESET}"
  
  if docker compose version &> /dev/null; then
    docker compose -f "${COMPOSE_FILE}" down --volumes --remove-orphans
  else
    docker-compose -f "${COMPOSE_FILE}" down --volumes --remove-orphans
  fi

  echo -e "  ${COLOR_GREEN}✓ Todos los servicios y recursos de prueba han sido limpiados.${COLOR_RESET}"
  echo ""
}

show_status() {
  echo -e "  ${COLOR_BOLD}Contenedores activos del entorno PodVanguard:${COLOR_RESET}"
  docker ps --filter "name=pv-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
}

case "${1:-}" in
  start)
    start_env
    ;;
  stop)
    stop_env
    ;;
  status)
    print_header
    check_docker
    show_status
    ;;
  restart)
    stop_env
    start_env
    ;;
  *)
    print_header
    echo "  USO: ./demo-env.sh {start|stop|status|restart}"
    echo ""
    echo "  Comandos disponibles:"
    echo "    start    Descarga (si es necesario) y levanta los 4 microservicios de demostración"
    echo "    stop     Detiene y remueve los contenedores y volúmenes de prueba"
    echo "    status   Muestra el estado de salud de los contenedores pv-*"
    echo "    restart  Reinicia el entorno completo"
    echo ""
    exit 1
    ;;
esac
