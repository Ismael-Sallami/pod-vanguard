// ==============================================================================
// PodVanguard - Centro de Mando Web de Alto Rendimiento para Contenedores & Pods
// Autor: Ismael Sallami Moreno
//
// Punto de entrada del ejecutable. Realiza la comprobación estricta de plataforma
// Linux, procesa los argumentos de línea de comandos, inicializa los motores de
// Docker, Kubernetes y Sentinel Shield, y arranca el servidor web reactivo en Axum.
// ==============================================================================

mod api;
mod docker;
mod k8s;
mod pruner;
mod sentinel;
mod topology;
mod ws;

use api::{build_router, AppState};
use docker::DockerEngine;
use k8s::K8sEngine;
use pruner::PrunerEngine;
use std::env;
use std::net::SocketAddr;
use std::process::Command;
use std::sync::Arc;
use sysinfo::System;
use tokio::sync::Mutex;
use topology::TopologyEngine;

const VERSION: &str = "0.1.0";

/// Muestra la ayuda de uso de la herramienta en terminal.
fn print_help() {
    println!(
        r#"
PodVanguard {} - Centro de Mando Web para Contenedores y Pods en Linux
Autor: Ismael Sallami Moreno

USO:
    pod-vanguard [OPCIONES]

OPCIONES:
    -p, --port <PUERTO>    Puerto TCP donde escuchará el servidor web (por defecto: 9090)
    -H, --host <HOST>      Dirección de red para vincular el servidor (por defecto: 127.0.0.1)
        --open             Abre automáticamente el navegador predeterminado al arrancar
    -v, --version          Muestra la versión de PodVanguard y finaliza
    -h, --help             Muestra este mensaje de ayuda y finaliza

EJEMPLOS:
    pod-vanguard
    pod-vanguard -p 8080 --open
    pod-vanguard -H 0.0.0.0 -p 9090
"#,
        VERSION
    );
}

/// Muestra el banner ASCII senior en consola.
fn print_banner(host: &str, port: u16) {
    println!(
        r#"
================================================================================
  P O D   V A N G U A R D  ::  Centro de Mando Web para Contenedores & Pods
  Plataforma: Linux (x86_64) | Versión: {} | Autor: Ismael Sallami Moreno
================================================================================
"#,
        VERSION
    );
    println!("  [+] Servidor Web Activo: http://{}:{}", host, port);
    println!("  [+] Socket Docker:       /var/run/docker.sock");
    println!("  [+] Kubernetes:          Detección automática de ~/.kube/config");
    println!("  [+] Sentinel Shield:     Motor heurístico de seguridad cargado");
    println!("  [+] Presiona Ctrl+C para detener el servicio de manera ordenada.\n");
}

#[tokio::main]
async fn main() {
    // 1. Verificación estricta de arquitectura y sistema operativo Linux
    #[cfg(not(target_os = "linux"))]
    {
        eprintln!(
            "Error fatal: PodVanguard está optimizado exclusivamente para el kernel Linux.\n\
             No se permite su ejecución en otros sistemas operativos sin subsistema de cgroups y sockets nativos."
        );
        std::process::exit(1);
    }

    let args: Vec<String> = env::args().collect();
    let mut port: u16 = 9090;
    let mut host = "127.0.0.1".to_string();
    let mut auto_open = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "-p" | "--port" => {
                if i + 1 < args.len() {
                    port = args[i + 1].parse().unwrap_or_else(|_| {
                        eprintln!("Error: El puerto debe ser un número entero válido.");
                        std::process::exit(1);
                    });
                    i += 1;
                }
            }
            "-H" | "--host" => {
                if i + 1 < args.len() {
                    host = args[i + 1].clone();
                    i += 1;
                }
            }
            "--open" => {
                auto_open = true;
            }
            "-v" | "--version" => {
                println!("pod-vanguard {}", VERSION);
                return;
            }
            "-h" | "--help" => {
                print_help();
                return;
            }
            unknown => {
                eprintln!("Opción no reconocida: {}", unknown);
                print_help();
                std::process::exit(1);
            }
        }
        i += 1;
    }

    // 2. Inicialización del motor de Docker
    let docker = match DockerEngine::new() {
        Ok(engine) => {
            match engine.ping().await {
                Ok(_) => {
                    println!("[PodVanguard] Demonio Docker verificado con éxito.");
                    engine
                }
                Err(e) => {
                    eprintln!("[PodVanguard] Advertencia Docker: {}. Asegúrate de que el servicio está activo.", e);
                    engine
                }
            }
        }
        Err(e) => {
            eprintln!("[PodVanguard] Advertencia: No se pudo conectar a Docker: {}", e);
            eprintln!("[PodVanguard] Intentando continuar con funcionalidad limitada...");
            // Reintento con cliente estándar
            DockerEngine::new().unwrap_or_else(|_| {
                eprintln!("Error crítico al inicializar cliente Docker.");
                std::process::exit(1);
            })
        }
    };

    // 3. Inicialización del motor Kubernetes
    let k8s = K8sEngine::new();
    let k8s_status = k8s.get_cluster_status().await;
    if k8s_status.connected {
        println!(
            "[PodVanguard] Clúster Kubernetes conectado: context='{}', url='{}'",
            k8s_status.current_context, k8s_status.server_url
        );
    } else {
        println!(
            "[PodVanguard] Kubernetes inactivo o sin clúster local (Modo Autónomo Docker activo)."
        );
    }

    // 4. Inicialización de motores auxiliares (Pruner, Topología, Sysinfo)
    let pruner = Arc::new(PrunerEngine::new(docker.raw_client().clone()));
    let topology = Arc::new(TopologyEngine::new(docker.clone()));

    let mut sys = System::new_all();
    sys.refresh_all();
    let sys_arc = Arc::new(Mutex::new(sys));

    let app_state = AppState {
        docker,
        k8s,
        pruner,
        topology,
        sys: sys_arc,
    };

    let router = build_router(app_state);

    let addr_str = format!("{}:{}", host, port);
    let addr: SocketAddr = match addr_str.parse() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("Error parseando dirección de red '{}': {}", addr_str, e);
            std::process::exit(1);
        }
    };

    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Error vinculando servidor en {}: {}", addr, e);
            std::process::exit(1);
        }
    };

    print_banner(&host, port);

    // Apertura opcional del navegador en Linux
    if auto_open {
        let url = format!("http://{}:{}", host, port);
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            let _ = Command::new("xdg-open").arg(&url).spawn();
        });
    }

    // Servidor Axum con apagado elegante ante SIGINT (Ctrl+C)
    if let Err(e) = axum::serve(listener, router)
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c()
                .await
                .expect("Fallo al registrar controlador SIGINT (Ctrl+C)");
            println!("\n[PodVanguard] Deteniendo servidor de forma ordenada. ¡Hasta pronto!");
        })
        .await
    {
        eprintln!("[PodVanguard] Error fatal en el servidor web: {}", e);
    }
}
