# PodVanguard

Centro de Mando Web de Alto Rendimiento para Contenedores & Pods en Linux.  
Desarrollado en Rust con arquitectura de binario estático autocontenido y panel reactivo embebido.

Autor: Ismael Sallami Moreno (ismEngineer23@gmail.com)  
Licencia: MIT  
Repositorio: https://github.com/Ismael-Sallami/pod-vanguard  

---

```
================================================================================
  P O D   V A N G U A R D  ::  CONTROL PLANE & RUNTIME MONITOR
  Plataforma: Linux (x86_64) | Arquitectura: Rust Core + Embedded React 19
================================================================================
```

---

## 1. Vision General

PodVanguard es una plataforma de observabilidad, auditoria de seguridad y orquestacion para entornos de desarrollo y servidores Linux. Combina la velocidad de un nucleo asincrono en Rust con una interfaz web reactiva inspirada en la estetica de ingenieria mecanica (Teenage Engineering y Brutalismo Suizo), optimizada para ofrecer alta densidad informativa, atajos de teclado globales y cero dependencias de ejecucion en el host.

El sistema se compila en un unico ejecutable binario de 4.5 MB que incluye todos los activos estaticos de la interfaz web, sirviendo el centro de mando localmente sin requerir Node.js, Python ni servidores externos instalados por el usuario.

---

## 2. Caracteristicas Principales

- Gestion Unificada de Contenedores: Control de ciclo de vida completo (arranque, detencion, reinicio, pausa y eliminacion) interactuando directamente con el socket UNIX local de Docker (/var/run/docker.sock) o Podman mediante llamadas asincronas.
- Introspeccion de Kubernetes (K8s): Deteccion automatica de configuracion en `~/.kube/config`, lectura de namespaces, estados de pods, reinicios de contenedores y ubicacion en nodos del cluster. Si no se detecta cluster activo, opera de forma autonoma sin interrupciones.
- Vanguard Sentinel Shield: Motor de analisis heuristico de seguridad que audita en tiempo real variables de entorno en busca de secretos expuestos en texto plano (claves de AWS, tokens de GitHub/OpenAI, llaves privadas RSA/SSH), banderas privilegiadas, procesos corriendo como root (UID 0), puertos sensibles expuestos a 0.0.0.0 (PostgreSQL, MySQL, Redis, Docker daemon) y ausencia de limites de memoria (riesgo OOM).
- Saneamiento de Disco Inteligente (Pruner): Calculo milimetrico del almacenamiento residual ocupado por contenedores parados, imagenes huerfanas (dangling) y volumenes desconectados, con ejecucion de purga segura en un clic.
- Terminal Web Interactiva (PTY Exec): Acceso directo a una consola interactiva dentro de cualquier contenedor en ejecucion mediante WebSockets y redimensionamiento dinamico de terminal.
- Transmision de Logs en Vivo: Flujo continuo de registros (stdout y stderr) con filtrado instantaneo por expresiones regulares (Regex) y auto-desplazamiento.
- Esquematico CAD de Topologia de Red: Grafo interactivo en lienzo vectorial con nodos arrastrables que visualiza redes virtuales (Bridge, Host, Overlay), puertos publicados y volumenes montados.
- Telemetria de Hardware con Medidores VU: Monitoreo en tiempo real del uso de CPU y memoria RAM del host mediante bloques LED segmentados e indicadores de estado de alta precision.
- Command Palette Global (Ctrl+K / Cmd+K): Buscador flotante para navegacion instantanea entre modulos y ejecucion de acciones sin despegar las manos del teclado.

---

## 3. Arquitectura del Sistema

```
+-----------------------------------------------------------------------------+
|                          PODVANGUARD CONTROL PLANE                          |
+-----------------------------------------------------------------------------+
|                                                                             |
|   +-----------------------+                    +------------------------+   |
|   |   React 19 Dashboard  | <--- WebSockets -- |   Axum HTTP/WS Engine  |   |
|   |   (Teenage Eng. UI)   |      REST JSON     |   (Rust Async Runtime) |   |
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

## 4. Instalacion

### Metodo 1: Instalador en una linea (Recomendado)

Ejecuta el siguiente comando en tu terminal para descargar e instalar automaticamente el binario en `~/.local/bin`:

```bash
curl -fsSL https://raw.githubusercontent.com/Ismael-Sallami/pod-vanguard/main/install.sh | bash
```

### Metodo 2: Compilacion desde codigo fuente

Requisitos de compilacion:
- Linux x86_64
- Rust y Cargo (1.80+)
- Node.js (v18+) y npm para el empaquetado inicial de la interfaz web

```bash
git clone https://github.com/Ismael-Sallami/pod-vanguard.git
cd pod-vanguard

# Compilar los activos de la interfaz web
cd frontend
npm install
npm run build
cd ..

# Compilar el binario release con LTO y optimizaciones maximas
cargo build --release

# El binario autocontenido estara disponible en:
./target/release/pod-vanguard
```

---

## 5. Modo de Uso

Inicia el centro de mando ejecutando el binario instalado:

```bash
# Inicio estandar en http://127.0.0.1:9090
pod-vanguard

# O utilizando el alias corto
pv

# Especificar un puerto y abrir el navegador automaticamente
pod-vanguard -p 8080 --open

# Vincular a todas las interfaces de red del servidor
pod-vanguard -H 0.0.0.0 -p 9090
```

### Opciones de Linea de Comandos

```
USO:
    pod-vanguard [OPCIONES]

OPCIONES:
    -p, --port <PUERTO>    Puerto TCP de escucha para la interfaz web (por defecto: 9090)
    -H, --host <HOST>      Direccion IP de enlace para el servidor (por defecto: 127.0.0.1)
        --open             Abre el navegador predeterminado del sistema automaticamente
    -v, --version          Muestra la version instalada y finaliza
    -h, --help             Muestra la ayuda de linea de comandos
```

---

## 6. Atajos de Teclado del Dashboard

- `Ctrl + K` / `Cmd + K`: Abre la paleta de comandos global para salto rapido y acciones inmediatas.
- `Escape`: Cierra modales y paneles desplegables activos.
- `Enter`: Confirma comandos en la terminal interactiva o en el buscador.
- `Arriba / Abajo`: Navegacion por el historial de comandos ejecutados en la shell.

---

## 7. Autor y Licencia

Proyecto disenado e implementado por Ismael Sallami Moreno (ismEngineer23@gmail.com).  
Distribuido bajo los terminos de la Licencia MIT.
