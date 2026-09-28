# PodVanguard

Centro de Mando Web de Alto Rendimiento para Contenedores & Pods en Linux.  
Arquitectura de binario nativo estático en Rust con panel web reactivo embebido.

Autor: Ismael Sallami Moreno  
Licencia: MIT  

---

```
================================================================================
  P O D   V A N G U A R D  ::  CONTROL PLANE & RUNTIME MONITOR
  Plataforma: Linux (x86_64) | Arquitectura: Rust Core + Embedded Web Dashboard
================================================================================
```

---

## 1. Visión General

PodVanguard es una herramienta de observabilidad, auditoría de seguridad y gestión de infraestructura local para contenedores Docker y pods de Kubernetes en entornos Linux. Diseñado para ofrecer baja latencia, consumo mínimo de recursos y cero dependencias de ejecución en el host, compila todo el motor asíncrono y los activos del panel web dentro de un único ejecutable binario estático de ~4.5 MB.

No requiere runtimes externos en el host (sin Node.js, Python ni servicios de terceros adicionales). Solo interactúa directamente con el socket local de Docker (`/var/run/docker.sock`) y la configuración activa de Kubernetes (`~/.kube/config`).

---

## 2. Capacidades Principales

- **Gestión de Ciclo de Vida de Contenedores**: Inicio, detención, reinicio, pausa y eliminación directa mediante llamadas asíncronas de bajo nivel a Docker/Podman vía socket UNIX.
- **Introspección de Kubernetes (K8s)**: Detección automática del cluster local vía kubeconfig, visualización de namespaces, estado de pods, reinicios de réplicas y mapeo de nodos. Si no hay cluster disponible, opera de forma transparente en modo solo-Docker.
- **Sentinel Shield (Auditoría de Seguridad)**: Detección heurística de riesgos en tiempo real:
  - Variables de entorno con claves y tokens en texto plano (AWS, OpenAI, GitHub, claves privadas RSA/SSH).
  - Contenedores ejecutándose como `root` (UID 0) o con bandera `--privileged`.
  - Puertos de bases de datos y administración expuestos sin filtrar a `0.0.0.0` (Postgres, MySQL, Redis, Docker API).
  - Ausencia de límites de memoria RAM (prevención de caídas por OOM-Killer).
- **Pruner de Almacenamiento**: Cálculo de espacio recuperable en disco (contenedores parados, imágenes huérfanas *dangling* y volúmenes sin vincular) con ejecución de saneamiento seguro en un solo clic.
- **Terminal Web Interactiva (PTY)**: Sesión de consola interactiva en tiempo real sobre WebSockets (`/bin/sh` o `/bin/bash`) acoplada al interior de cualquier contenedor activo.
- **Transmisión de Registros (Live Logs)**: Flujo en directo de `stdout` y `stderr` vía WebSockets, con filtrado dinámico mediante expresiones regulares (Regex) y auto-desplazamiento.
- **Topología de Red Vectorial**: Grafo interactivo en lienzo tipo CAD para inspeccionar redes virtuales (bridge, host, overlay), puertos expuestos y volúmenes montados.
- **Telemetría de Recursos**: Monitorización en vivo del uso de CPU y memoria RAM del host mediante instrumentación de hardware e indicadores de carga.
- **Command Palette Global (`Ctrl+K`)**: Buscador flotante para cambio rápido de módulos y ejecución directa de acciones de control.

---

## 3. Esquema de Arquitectura

```
+-----------------------------------------------------------------------------+
|                          PODVANGUARD CONTROL PLANE                          |
+-----------------------------------------------------------------------------+
|                                                                             |
|   +-----------------------+                    +------------------------+   |
|   |   Web UI Dashboard    | <--- WebSockets -- |   Axum HTTP/WS Engine  |   |
|   |   (Single Page App)   |      REST JSON     |   (Rust Async Runtime) |   |
|   +-----------------------+                    +------------------------+   |
|               ^                                             |               |
|               |                                             v               |
|        (Embedded Assets)                       +------------------------+   |
|        include_dir!                            |      Core Engines      |   |
|                                                +------------------------+   |
|                                                | - Bollard Docker Core  |   |
|                                                | - K8s Config Inspector |   |
|                                                | - Sentinel Shield      |   |
|                                                | - Storage Pruner       |   |
|                                                | - CAD Topology Engine  |   |
|                                                +------------------------+   |
|                                                             |               |
+-------------------------------------------------------------|---------------+
                                                              v
                                             +--------------------------------+
                                             |        Kernel de Linux         |
                                             |  - /var/run/docker.sock        |
                                             |  - ~/.kube/config              |
                                             |  - cgroups v2 / procfs         |
                                             +--------------------------------+
```

---

## 4. Instalación

### Método 1: Script de instalación directa (Recomendado)

Descarga e instala el binario optimizado para Linux x86_64 directamente en `~/.local/bin`:

```bash
curl -fsSL https://raw.githubusercontent.com/Ismael-Sallami/pod-vanguard/main/install.sh | bash
```

### Método 2: Compilación desde código fuente

**Requisitos previos:**
- Sistema operativo Linux x86_64
- Toolchain de Rust (Cargo 1.80+)
- Node.js (v18+) y npm (exclusivamente para la generación previa de los activos web)

```bash
# 1. Clonar el repositorio
git clone https://github.com/Ismael-Sallami/pod-vanguard.git
cd pod-vanguard

# 2. Compilar los activos de la interfaz web
cd frontend
npm install
npm run build
cd ..

# 3. Compilar el binario release en Rust
cargo build --release

# El ejecutable compilado estará disponible en:
./target/release/pod-vanguard
```

---

## 5. Modo de Uso

Inicia el centro de mando ejecutando el binario:

```bash
# Inicio por defecto en http://127.0.0.1:9090
pod-vanguard

# O utilizando el alias abreviado configurado por el instalador
pv

# Abrir automáticamente el navegador predeterminado en un puerto específico
pod-vanguard -p 8080 --open

# Escuchar en todas las interfaces de red locales
pod-vanguard -H 0.0.0.0 -p 9090
```

### Parámetros de Línea de Comandos

```
USO:
    pod-vanguard [OPCIONES]

OPCIONES:
    -p, --port <PUERTO>    Puerto TCP de escucha para el servidor HTTP (por defecto: 9090)
    -H, --host <HOST>      Dirección IP de enlace (por defecto: 127.0.0.1)
        --open             Abre automáticamente el navegador predeterminado al iniciar
    -v, --version          Muestra la versión de la herramienta y finaliza
    -h, --help             Muestra este mensaje de ayuda
```

---

## 6. Atajos de Teclado del Dashboard

- `Ctrl + K` / `Cmd + K`: Abre la paleta de comandos global para búsqueda y saltos directos.
- `Escape`: Cierra modales, menús contextuales y la paleta de comandos.
- `Enter`: Confirma órdenes en la terminal web interactiva o filtros de búsqueda.
- `Flecha Arriba / Abajo`: Historial de comandos en la terminal integrada.

---

## 7. Autor y Licencia

Desarrollado por **Ismael Sallami Moreno**.  
Distribuido bajo licencia de código abierto **MIT**.
