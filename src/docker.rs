// ==============================================================================
// PodVanguard - Motor de Interacción con Docker / Podman API
// Autor: Ismael Sallami Moreno <ismEngineer23@gmail.com>
//
// Este módulo encapsula la comunicación asíncrona mediante sockets UNIX con el
// demonio de Docker (/var/run/docker.sock) o Podman. Proporciona abstracciones
// de alto rendimiento para el ciclo de vida de contenedores, cálculo de métricas
// en tiempo real (CPU %, Memoria, E/S de Red y Disco), gestión de volúmenes e imágenes.
// ==============================================================================

use std::collections::HashMap;
use bollard::Docker;
use bollard::container::{
    InspectContainerOptions, ListContainersOptions, LogsOptions, RemoveContainerOptions,
    RestartContainerOptions, StartContainerOptions, StopContainerOptions,
};
use bollard::image::{ListImagesOptions, RemoveImageOptions};
use bollard::network::ListNetworksOptions;
use bollard::volume::ListVolumesOptions;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

/// Información esencial y normalizada de un contenedor para visualización en cuadrícula/tabla.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerSummary {
    pub id: String,
    pub short_id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub created: i64,
    pub ports: Vec<String>,
}

/// Mapeo detallado de puertos de red de un contenedor hacia el host.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortBindingInfo {
    pub host_ip: String,
    pub host_port: String,
    pub container_port: String,
    pub protocol: String,
}

/// Detalles exhaustivos de un contenedor tras inspección profunda.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerDetail {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub created: String,
    pub restart_policy: String,
    pub ip_address: String,
    pub mac_address: String,
    pub gateway: String,
    pub mounts: Vec<MountDetail>,
    pub env: Vec<String>,
    pub command: Vec<String>,
    pub ports: Vec<PortBindingInfo>,
    pub privileged: bool,
    pub memory_limit: i64,
    pub cpu_shares: i64,
}

/// Información de montaje de volúmenes o bind mounts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MountDetail {
    pub mount_type: String,
    pub source: String,
    pub destination: String,
    pub mode: String,
    pub rw: bool,
}

/// Métrica en tiempo real de uso de recursos por contenedor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerStats {
    pub container_id: String,
    pub cpu_percent: f64,
    pub memory_used_bytes: u64,
    pub memory_limit_bytes: u64,
    pub memory_percent: f64,
    pub net_rx_bytes: u64,
    pub net_tx_bytes: u64,
    pub block_read_bytes: u64,
    pub block_write_bytes: u64,
}

/// Resumen de una imagen de contenedor en el sistema.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageSummary {
    pub id: String,
    pub short_id: String,
    pub repo_tags: Vec<String>,
    pub size_bytes: i64,
    pub created: i64,
}

/// Resumen de un volumen persistente de Docker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeSummary {
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub mountpoint: String,
}

/// Resumen de una red virtual Docker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkSummary {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub subnet: Option<String>,
    pub gateway: Option<String>,
    pub connected_containers: Vec<String>,
}

/// Cliente unificado de Docker para operaciones asíncronas en PodVanguard.
#[derive(Clone)]
pub struct DockerEngine {
    client: Docker,
}

impl DockerEngine {
    /// Inicializa la conexión con el demonio local a través del socket UNIX padrão de Linux.
    pub fn new() -> Result<Self, String> {
        let client = Docker::connect_with_socket_defaults()
            .map_err(|e| format!("Fallo al conectar con el socket de Docker (/var/run/docker.sock): {}", e))?;
        Ok(Self { client })
    }

    /// Comprueba la salud de la conexión y recupera la versión de la API de Docker.
    pub async fn ping(&self) -> Result<String, String> {
        self.client
            .ping()
            .await
            .map(|res| res)
            .map_err(|e| format!("El demonio de Docker no responde al ping: {}", e))
    }

    /// Lista todos los contenedores presentes en el host (activos y detenidos).
    pub async fn list_containers(&self, all: bool) -> Result<Vec<ContainerSummary>, String> {
        let filters: HashMap<String, Vec<String>> = HashMap::new();
        let options = Some(ListContainersOptions {
            all,
            filters,
            ..Default::default()
        });

        let containers = self
            .client
            .list_containers(options)
            .await
            .map_err(|e| format!("Error listando contenedores: {}", e))?;

        let summaries = containers
            .into_iter()
            .map(|c| {
                let full_id = c.id.unwrap_or_default();
                let short_id = if full_id.len() >= 12 {
                    full_id[..12].to_string()
                } else {
                    full_id.clone()
                };

                let name = c
                    .names
                    .and_then(|names| names.first().map(|n| n.trim_start_matches('/').to_string()))
                    .unwrap_or_else(|| "sin-nombre".to_string());

                let ports = c
                    .ports
                    .unwrap_or_default()
                    .into_iter()
                    .map(|p| {
                        let ip = p.ip.unwrap_or_default();
                        let public = p.public_port.map(|port| port.to_string()).unwrap_or_default();
                        let private = p.private_port;
                        let typ = p.typ.map(|t| format!("{:?}", t).to_lowercase()).unwrap_or_else(|| "tcp".to_string());
                        if !public.is_empty() {
                            format!("{}:{}:{}->{}/{}", ip, public, public, private, typ)
                        } else {
                            format!("{}/{}", private, typ)
                        }
                    })
                    .collect();

                ContainerSummary {
                    id: full_id,
                    short_id,
                    name,
                    image: c.image.unwrap_or_else(|| "desconocida".to_string()),
                    state: c.state.unwrap_or_else(|| "desconocido".to_string()),
                    status: c.status.unwrap_or_else(|| "desconocido".to_string()),
                    created: c.created.unwrap_or(0),
                    ports,
                }
            })
            .collect();

        Ok(summaries)
    }

    /// Inspecciona en profundidad un contenedor por su ID o nombre.
    pub async fn inspect_container(&self, id: &str) -> Result<ContainerDetail, String> {
        let inspect = self
            .client
            .inspect_container(id, None::<InspectContainerOptions>)
            .await
            .map_err(|e| format!("Error inspeccionando contenedor '{}': {}", id, e))?;

        let id = inspect.id.unwrap_or_default();
        let name = inspect
            .name
            .map(|n| n.trim_start_matches('/').to_string())
            .unwrap_or_default();

        let state_obj = inspect.state.unwrap_or_default();
        let state = state_obj.status.map(|s| format!("{:?}", s)).unwrap_or_default();
        let status = if state_obj.running.unwrap_or(false) {
            "En Ejecución".to_string()
        } else {
            format!("Detenido (ExitCode: {})", state_obj.exit_code.unwrap_or(0))
        };

        let host_config = inspect.host_config.unwrap_or_default();
        let privileged = host_config.privileged.unwrap_or(false);
        let memory_limit = host_config.memory.unwrap_or(0);
        let cpu_shares = host_config.cpu_shares.unwrap_or(0);
        let restart_policy = host_config
            .restart_policy
            .and_then(|r| r.name.map(|name| format!("{:?}", name)))
            .unwrap_or_else(|| "no".to_string());

        let config = inspect.config.unwrap_or_default();
        let image = config.image.unwrap_or_default();
        let env = config.env.unwrap_or_default();
        let command = config.cmd.unwrap_or_default();

        let net_settings = inspect.network_settings.unwrap_or_default();
        let ip_address = net_settings.ip_address.unwrap_or_default();
        let mac_address = net_settings.mac_address.unwrap_or_default();
        let gateway = net_settings.gateway.unwrap_or_default();

        let mut ports = Vec::new();
        if let Some(port_map) = net_settings.ports {
            for (container_port_proto, bindings) in port_map {
                let parts: Vec<&str> = container_port_proto.split('/').collect();
                let container_port = parts.first().unwrap_or(&"").to_string();
                let protocol = parts.get(1).unwrap_or(&"tcp").to_string();

                if let Some(bind_list) = bindings {
                    for b in bind_list {
                        ports.push(PortBindingInfo {
                            host_ip: b.host_ip.unwrap_or_default(),
                            host_port: b.host_port.unwrap_or_default(),
                            container_port: container_port.clone(),
                            protocol: protocol.clone(),
                        });
                    }
                } else {
                    ports.push(PortBindingInfo {
                        host_ip: String::new(),
                        host_port: String::new(),
                        container_port,
                        protocol,
                    });
                }
            }
        }

        let mounts = inspect
            .mounts
            .unwrap_or_default()
            .into_iter()
            .map(|m| MountDetail {
                mount_type: m.typ.map(|t| format!("{:?}", t)).unwrap_or_default(),
                source: m.source.unwrap_or_default(),
                destination: m.destination.unwrap_or_default(),
                mode: m.mode.unwrap_or_default(),
                rw: m.rw.unwrap_or(true),
            })
            .collect();

        Ok(ContainerDetail {
            id,
            name,
            image,
            state,
            status,
            created: inspect.created.unwrap_or_default(),
            restart_policy,
            ip_address,
            mac_address,
            gateway,
            mounts,
            env,
            command,
            ports,
            privileged,
            memory_limit,
            cpu_shares,
        })
    }

    /// Inicia un contenedor detenido.
    pub async fn start_container(&self, id: &str) -> Result<(), String> {
        self.client
            .start_container(id, None::<StartContainerOptions<String>>)
            .await
            .map_err(|e| format!("Error iniciando contenedor '{}': {}", id, e))
    }

    /// Detiene un contenedor en ejecución con un tiempo de espera de apagado ordenado.
    pub async fn stop_container(&self, id: &str, timeout_seconds: i64) -> Result<(), String> {
        let options = Some(StopContainerOptions { t: timeout_seconds });
        self.client
            .stop_container(id, options)
            .await
            .map_err(|e| format!("Error deteniendo contenedor '{}': {}", id, e))
    }

    /// Reinicia un contenedor.
    pub async fn restart_container(&self, id: &str, timeout_seconds: i64) -> Result<(), String> {
        let options = Some(RestartContainerOptions { t: timeout_seconds as isize });
        self.client
            .restart_container(id, options)
            .await
            .map_err(|e| format!("Error reiniciando contenedor '{}': {}", id, e))
    }

    /// Pausa los procesos de un contenedor mediante cgroups freezer.
    pub async fn pause_container(&self, id: &str) -> Result<(), String> {
        self.client
            .pause_container(id)
            .await
            .map_err(|e| format!("Error pausando contenedor '{}': {}", id, e))
    }

    /// Reanuda los procesos de un contenedor pausado.
    pub async fn unpause_container(&self, id: &str) -> Result<(), String> {
        self.client
            .unpause_container(id)
            .await
            .map_err(|e| format!("Error reanudando contenedor '{}': {}", id, e))
    }

    /// Elimina un contenedor del host (con opción de forzado).
    pub async fn remove_container(&self, id: &str, force: bool) -> Result<(), String> {
        let options = Some(RemoveContainerOptions {
            force,
            v: true, // Borra volúmenes anónimos asociados
            ..Default::default()
        });
        self.client
            .remove_container(id, options)
            .await
            .map_err(|e| format!("Error eliminando contenedor '{}': {}", id, e))
    }

    /// Lista todas las imágenes almacenadas localmente.
    pub async fn list_images(&self) -> Result<Vec<ImageSummary>, String> {
        let images = self
            .client
            .list_images(Some(ListImagesOptions::<String> {
                all: true,
                ..Default::default()
            }))
            .await
            .map_err(|e| format!("Error listando imágenes: {}", e))?;

        let list = images
            .into_iter()
            .map(|img| {
                let full_id = img.id;
                let short_id = if full_id.len() >= 19 && full_id.starts_with("sha256:") {
                    full_id[7..19].to_string()
                } else if full_id.len() >= 12 {
                    full_id[..12].to_string()
                } else {
                    full_id.clone()
                };

                ImageSummary {
                    id: full_id,
                    short_id,
                    repo_tags: img.repo_tags,
                    size_bytes: img.size,
                    created: img.created,
                }
            })
            .collect();

        Ok(list)
    }

    /// Elimina una imagen local por su ID o nombre de etiqueta.
    pub async fn remove_image(&self, id: &str, force: bool) -> Result<(), String> {
        let options = Some(RemoveImageOptions {
            force,
            ..Default::default()
        });
        self.client
            .remove_image(id, options, None)
            .await
            .map(|_| ())
            .map_err(|e| format!("Error eliminando imagen '{}': {}", id, e))
    }

    /// Lista todos los volúmenes configurados en Docker.
    pub async fn list_volumes(&self) -> Result<Vec<VolumeSummary>, String> {
        let res = self
            .client
            .list_volumes(None::<ListVolumesOptions<String>>)
            .await
            .map_err(|e| format!("Error listando volúmenes: {}", e))?;

        let volumes = res
            .volumes
            .unwrap_or_default()
            .into_iter()
            .map(|v| VolumeSummary {
                name: v.name,
                driver: v.driver,
                scope: format!("{:?}", v.scope),
                mountpoint: v.mountpoint,
            })
            .collect();

        Ok(volumes)
    }

    /// Lista todas las redes de Docker y los contenedores que las integran.
    pub async fn list_networks(&self) -> Result<Vec<NetworkSummary>, String> {
        let networks = self
            .client
            .list_networks(None::<ListNetworksOptions<String>>)
            .await
            .map_err(|e| format!("Error listando redes: {}", e))?;

        let list = networks
            .into_iter()
            .map(|net| {
                let mut subnet = None;
                let mut gateway = None;

                if let Some(ipam) = net.ipam {
                    if let Some(configs) = ipam.config {
                        if let Some(first_cfg) = configs.first() {
                            subnet = first_cfg.subnet.clone();
                            gateway = first_cfg.gateway.clone();
                        }
                    }
                }

                let mut connected_containers = Vec::new();
                if let Some(containers) = net.containers {
                    for (_cid, c_info) in containers {
                        if let Some(name) = c_info.name {
                            connected_containers.push(name);
                        }
                    }
                }

                NetworkSummary {
                    id: net.id.unwrap_or_default(),
                    name: net.name.unwrap_or_default(),
                    driver: net.driver.unwrap_or_default(),
                    scope: net.scope.unwrap_or_default(),
                    subnet,
                    gateway,
                    connected_containers,
                }
            })
            .collect();

        Ok(list)
    }

    /// Obtiene las últimas líneas de logs de un contenedor como cadena de texto.
    pub async fn get_logs(&self, id: &str, tail: &str) -> Result<String, String> {
        let options = Some(LogsOptions::<String> {
            stdout: true,
            stderr: true,
            tail: tail.to_string(),
            timestamps: true,
            ..Default::default()
        });

        let mut stream = self.client.logs(id, options);
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(output) => {
                    buffer.push_str(&output.to_string());
                }
                Err(e) => {
                    return Err(format!("Error leyendo logs del contenedor '{}': {}", id, e));
                }
            }
        }

        Ok(buffer)
    }

    /// Extrae una instantánea de métricas de rendimiento (CPU %, Memoria, Red) para un contenedor.
    ///
    /// Algoritmo de cálculo de CPU según estándar de Docker Engine:
    /// CPU % = ((cpu_delta / system_cpu_delta) * total_cpus) * 100.0
    pub async fn get_container_stats(&self, id: &str) -> Result<ContainerStats, String> {
        use bollard::container::StatsOptions;

        let options = Some(StatsOptions {
            stream: false,
            one_shot: true,
        });

        let mut stream = self.client.stats(id, options);

        if let Some(stats_res) = stream.next().await {
            let stats = stats_res.map_err(|e| format!("Error obteniendo métricas de '{}': {}", id, e))?;

            // 1. Cálculo de uso de CPU porcentual
            let cpu_delta = stats.cpu_stats.cpu_usage.total_usage as f64
                - stats.precpu_stats.cpu_usage.total_usage as f64;
            let system_cpu_delta = stats.cpu_stats.system_cpu_usage.unwrap_or(0) as f64
                - stats.precpu_stats.system_cpu_usage.unwrap_or(0) as f64;

            let online_cpus = stats.cpu_stats.online_cpus.unwrap_or(1) as f64;

            let cpu_percent = if system_cpu_delta > 0.0 && cpu_delta > 0.0 {
                (cpu_delta / system_cpu_delta) * online_cpus * 100.0
            } else {
                0.0
            };

            // 2. Cálculo de Memoria
            let memory_used = stats.memory_stats.usage.unwrap_or(0);
            let memory_limit = stats.memory_stats.limit.unwrap_or(1);
            let memory_percent = if memory_limit > 0 {
                (memory_used as f64 / memory_limit as f64) * 100.0
            } else {
                0.0
            };

            // 3. Métricas de Red
            let mut net_rx_bytes = 0;
            let mut net_tx_bytes = 0;
            if let Some(networks) = stats.networks {
                for (_net_name, net_data) in networks {
                    net_rx_bytes += net_data.rx_bytes;
                    net_tx_bytes += net_data.tx_bytes;
                }
            }

            // 4. Métricas de Bloques de Disco (I/O)
            let mut block_read_bytes = 0;
            let mut block_write_bytes = 0;
            if let Some(io_service) = stats.blkio_stats.io_service_bytes_recursive {
                for entry in io_service {
                    match entry.op.to_lowercase().as_str() {
                        "read" => block_read_bytes += entry.value,
                        "write" => block_write_bytes += entry.value,
                        _ => {}
                    }
                }
            }

            Ok(ContainerStats {
                container_id: id.to_string(),
                cpu_percent: (cpu_percent * 100.0).round() / 100.0,
                memory_used_bytes: memory_used,
                memory_limit_bytes: memory_limit,
                memory_percent: (memory_percent * 100.0).round() / 100.0,
                net_rx_bytes,
                net_tx_bytes,
                block_read_bytes,
                block_write_bytes,
            })
        } else {
            Err(format!("No se recibieron métricas para el contenedor '{}'", id))
        }
    }

    /// Retorna una referencia clonada al cliente interno de Bollard (útil para WebSockets y Exec).
    pub fn raw_client(&self) -> &Docker {
        &self.client
    }
}
