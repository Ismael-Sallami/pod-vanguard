#!/usr/bin/env bash
# ==============================================================================
# PodVanguard - Instalador Oficial Automatizado para Linux
# Autor: Ismael Sallami Moreno <ismEngineer23@gmail.com>
# Repositorio: https://github.com/Ismael-Sallami/pod-vanguard
# ==============================================================================

set -euo pipefail

BOLD='\033[1m'
ORANGE='\033[38;5;208m'
GREEN='\033[38;5;48m'
RED='\033[38;5;196m'
DIM='\033[2m'
RESET='\033[0m'

echo -e ""
echo -e "${ORANGE}================================================================================${RESET}"
echo -e "  ${BOLD}P O D   V A N G U A R D${RESET}  ::  Centro de Mando Web para Contenedores & Pods"
echo -e "  Plataforma: Linux (x86_64) | Autor: Ismael Sallami Moreno"
echo -e "${ORANGE}================================================================================${RESET}"
echo -e ""

# 1. Comprobación estricta de plataforma Linux x86_64
OS="$(uname -s)"
ARCH="$(uname -m)"

if [ "$OS" != "Linux" ]; then
    echo -e "${RED}[ERROR] PodVanguard está optimizado exclusivamente para el kernel Linux.${RESET}"
    echo -e "Sistema detectado: $OS"
    exit 1
fi

if [ "$ARCH" != "x86_64" ]; then
    echo -e "${RED}[ERROR] Arquitectura no soportada: $ARCH (se requiere x86_64).${RESET}"
    exit 1
fi

BIN_DIR="${HOME}/.local/bin"
TARGET="${BIN_DIR}/pod-vanguard"
SYMLINK="${BIN_DIR}/pv"
REPO="Ismael-Sallami/pod-vanguard"
RELEASE_URL="https://github.com/${REPO}/releases/latest/download/pod-vanguard-linux-x86_64"

mkdir -p "$BIN_DIR"

echo -e "  [+] Destino de instalación: ${BOLD}${TARGET}${RESET}"

# 2. Intento de descarga del binario estático precompilado
DOWNLOAD_SUCCESS=false

if command -v curl >/dev/null 2>&1; then
    echo -e "  [+] Descargando binario optimizado desde GitHub Releases..."
    if curl -fsSL -o "$TARGET" "$RELEASE_URL" 2>/dev/null; then
        chmod +x "$TARGET"
        DOWNLOAD_SUCCESS=true
    fi
elif command -v wget >/dev/null 2>&1; then
    echo -e "  [+] Descargando binario optimizado desde GitHub Releases..."
    if wget -q -O "$TARGET" "$RELEASE_URL" 2>/dev/null; then
        chmod +x "$TARGET"
        DOWNLOAD_SUCCESS=true
    fi
fi

# 3. Fallback a compilación local mediante Cargo si no hay release precompilada disponible
if [ "$DOWNLOAD_SUCCESS" = false ]; then
    echo -e "  [!] No se pudo obtener el binario precompilado. Intentando compilar mediante Cargo..."
    if command -v cargo >/dev/null 2>&1; then
        TEMP_DIR="$(mktemp -d)"
        git clone --depth 1 "https://github.com/${REPO}.git" "$TEMP_DIR" >/dev/null 2>&1
        (
            cd "$TEMP_DIR"
            if command -v npm >/dev/null 2>&1; then
                (cd frontend && npm install >/dev/null 2>&1 && npm run build >/dev/null 2>&1)
            fi
            cargo build --release >/dev/null 2>&1
            cp target/release/pod-vanguard "$TARGET"
            chmod +x "$TARGET"
        )
        rm -rf "$TEMP_DIR"
        DOWNLOAD_SUCCESS=true
    else
        echo -e "${RED}[ERROR] Se requiere Rust/Cargo o conexión para descargar la versión precompilada.${RESET}"
        exit 1
    fi
fi

# 4. Creación de alias / enlace simbólico 'pv'
ln -sf "$TARGET" "$SYMLINK"

echo -e ""
echo -e "  ${GREEN}[✓] PodVanguard instalado exitosamente en:${RESET} ${BOLD}${TARGET}${RESET}"
echo -e "  ${GREEN}[✓] Enlace corto disponible:${RESET} ${BOLD}${SYMLINK}${RESET}"
echo -e ""

# 5. Verificación de la variable de entorno PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo -e "  ${DIM}[NOTA] Añade ~/.local/bin a tu PATH agregando la siguiente línea a tu ~/.bashrc o ~/.zshrc:${RESET}"
    echo -e "  ${ORANGE}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}"
    echo -e ""
fi

echo -e "  Para iniciar el centro de mando:"
echo -e "    ${BOLD}pod-vanguard${RESET}  o simplemente  ${BOLD}pv${RESET}"
echo -e ""
