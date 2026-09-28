// ==============================================================================
// PodVanguard - Generador de Topología de Red y Arquitectura de Contenedores
// Autor: Ismael Sallami Moreno <ismEngineer23@gmail.com>
//
// Este módulo construye un grafo interactivo de nodos y aristas (Node-Link Graph)
// que representa la topología viva de la infraestructura local:
// Redes virtuales (Bridge, Overlay, Host), Contenedores enlazados, Puertos publicados
// hacia el exterior y Volúmenes de almacenamiento persistente montados.
// ==============================================================================

use crate::docker::DockerEngine;
use serde::{Deserialize, Serialize};

/// Tipo de entidad en el grafo topológico.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    Network,
    Container,
    Port,
    Volume,
}

/// Nodo individual en la visualización topológica.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyNode {
    pub id: String,
    pub label: String,
    pub node_type: NodeType,
    pub status: String,
    pub ip: Option<String>,
    pub details: String,
}

/// Relación direccionada entre dos nodos del grafo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyLink {
    pub source: String,
    pub target: String,
    pub link_type: String, // "network", "port", "volume"
    pub label: String,
}

/// Grafo completo de topología listo para ser consumido por el frontend SVG / D3 / Canvas.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyGraph {
    pub nodes: Vec<TopologyNode>,
    pub links: Vec<TopologyLink>,
    pub container_count: usize,
    pub network_count: usize,
    pub volume_count: usize,
}

/// Motor de construcción de topología.
pub struct TopologyEngine {
    docker: DockerEngine,
}

impl TopologyEngine {
    pub fn new(docker: DockerEngine) -> Self {
        Self { docker }
    }

    /// Construye el mapa topológico a partir del estado actual del subsistema Docker.
    pub async fn generate_graph(&self) -> Result<TopologyGraph, String> {
        let mut nodes = Vec::new();
        let mut links = Vec::new();

        // 1. Obtener redes y registrarlas como nodos centrales
        let networks = self.docker.list_networks().await.unwrap_or_default();
        let mut network_count = 0;

        for net in &networks {
            // Ignoramos redes internas irrelevantes o vacías si es necesario, o mostramos todas
            network_count += 1;
            let net_id = format!("net_{}", net.id);
            let label = if let Some(sub) = &net.subnet {
                format!("{} ({})", net.name, sub)
            } else {
                net.name.clone()
            };

            nodes.push(TopologyNode {
                id: net_id,
                label,
                node_type: NodeType::Network,
                status: "active".to_string(),
                ip: net.gateway.clone(),
                details: format!("Driver: {}, Scope: {}", net.driver, net.scope),
            });
        }

        // 2. Obtener contenedores y sus inspecciones para extraer puertos, redes y montajes
        let containers = self.docker.list_containers(true).await.unwrap_or_default();
        let container_count = containers.len();

        let mut seen_volumes = std::collections::HashSet::new();

        for c in containers {
            let c_node_id = format!("cnt_{}", c.id);
            let is_running = c.state.to_lowercase() == "running";

            nodes.push(TopologyNode {
                id: c_node_id.clone(),
                label: c.name.clone(),
                node_type: NodeType::Container,
                status: c.state.clone(),
                ip: None,
                details: format!("Imagen: {}", c.image),
            });

            // Inspeccionar para enlazar con redes exactas y puertos
            if let Ok(inspect) = self.docker.inspect_container(&c.id).await {
                // Enlazar a puertos expuestos en el Host
                for port_info in &inspect.ports {
                    if !port_info.host_port.is_empty() {
                        let port_node_id = format!("port_{}_{}", port_info.host_ip, port_info.host_port);
                        let port_label = format!("{}:{}", port_info.host_ip, port_info.host_port);

                        // Registrar nodo de puerto si no existe
                        if !nodes.iter().any(|n| n.id == port_node_id) {
                            nodes.push(TopologyNode {
                                id: port_node_id.clone(),
                                label: port_label,
                                node_type: NodeType::Port,
                                status: "listening".to_string(),
                                ip: Some(port_info.host_ip.clone()),
                                details: format!("Mapeo -> {}/{}", port_info.container_port, port_info.protocol),
                            });
                        }

                        // Arista de Contenedor -> Puerto Host
                        links.push(TopologyLink {
                            source: c_node_id.clone(),
                            target: port_node_id,
                            link_type: "port".to_string(),
                            label: format!("-> {}/{}", port_info.container_port, port_info.protocol),
                        });
                    }
                }

                // Enlazar a volúmenes
                for mount in &inspect.mounts {
                    let vol_name = if !mount.source.is_empty() {
                        &mount.source
                    } else {
                        &mount.destination
                    };
                    let vol_node_id = format!("vol_{}", vol_name.replace('/', "_"));

                    if seen_volumes.insert(vol_node_id.clone()) {
                        nodes.push(TopologyNode {
                            id: vol_node_id.clone(),
                            label: vol_name.clone(),
                            node_type: NodeType::Volume,
                            status: if mount.rw { "rw".to_string() } else { "ro".to_string() },
                            ip: None,
                            details: format!("Tipo: {}, Destino: {}", mount.mount_type, mount.destination),
                        });
                    }

                    links.push(TopologyLink {
                        source: c_node_id.clone(),
                        target: vol_node_id,
                        link_type: "volume".to_string(),
                        label: mount.destination.clone(),
                    });
                }
            }

            // Enlazar el contenedor a las redes virtuales donde reside
            for net in &networks {
                if net.connected_containers.contains(&c.name) {
                    let net_id = format!("net_{}", net.id);
                    links.push(TopologyLink {
                        source: c_node_id.clone(),
                        target: net_id,
                        link_type: "network".to_string(),
                        label: if is_running { "online" } else { "offline" }.to_string(),
                    });
                }
            }
        }

        let volume_count = seen_volumes.len();

        Ok(TopologyGraph {
            nodes,
            links,
            container_count,
            network_count,
            volume_count,
        })
    }
}
