// ==============================================================================
// PodVanguard - Motor de Inspección y Conectividad con Kubernetes (K8s)
// Autor: Ismael Sallami Moreno
//
// Este módulo gestiona la detección e interacción con clústeres Kubernetes locales
// o remotos (Minikube, K3s, Kind, MicroK8s, EKS, GKE, etc.).
// Analiza ~/.kube/config e interactúa de forma no invasiva mediante llamadas
// asíncronas a kubectl o introspección directa de especificaciones JSON.
// Si no hay clúster activo, se degrada elegantemente sin interrumpir PodVanguard.
// ==============================================================================

use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::process::Command;

/// Estado de conectividad y contexto del clúster Kubernetes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct K8sClusterStatus {
    pub connected: bool,
    pub cluster_name: String,
    pub current_context: String,
    pub server_url: String,
    pub total_pods: usize,
    pub total_namespaces: usize,
    pub error_message: Option<String>,
}

/// Resumen tabular de un Pod de Kubernetes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodSummary {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub ready_containers: String,
    pub restarts: i32,
    pub age: String,
    pub node: String,
    pub ip: String,
    pub cpu_request: Option<String>,
    pub memory_request: Option<String>,
}

/// Resumen de un espacio de nombres (Namespace) en Kubernetes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamespaceSummary {
    pub name: String,
    pub status: String,
    pub age: String,
}

/// Condición individual de salud y presión de un nodo Kubernetes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeConditionSummary {
    pub condition_type: String, // "Ready", "MemoryPressure", "DiskPressure", "PIDPressure"
    pub status: String,         // "True", "False"
    pub reason: String,
    pub message: String,
}

/// Resumen arquitectónico y telemetría de un Nodo del clúster Kubernetes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSummary {
    pub name: String,
    pub status: String,                  // "Ready", "NotReady", "Unknown"
    pub roles: Vec<String>,              // ["control-plane", "worker", "master"]
    pub internal_ip: String,
    pub hostname: String,
    pub os_image: String,
    pub kernel_version: String,
    pub container_runtime: String,
    pub kubelet_version: String,
    pub architecture: String,
    pub cpu_capacity: String,
    pub memory_capacity: String,
    pub pods_capacity: usize,
    pub allocated_pods_count: usize,
    pub pod_cidr: String,
    pub conditions: Vec<NodeConditionSummary>,
}

/// Gestor de Kubernetes para PodVanguard.
#[derive(Clone, Default)]
pub struct K8sEngine;

impl K8sEngine {
    pub fn new() -> Self {
        Self
    }

    /// Comprueba si existe archivo ~/.kube/config y si kubectl responde.
    pub async fn get_cluster_status(&self) -> K8sClusterStatus {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        let kubeconfig_path = format!("{}/.kube/config", home);

        if !Path::new(&kubeconfig_path).exists() {
            return K8sClusterStatus {
                connected: false,
                cluster_name: "No configurado".to_string(),
                current_context: "N/A".to_string(),
                server_url: "N/A".to_string(),
                total_pods: 0,
                total_namespaces: 0,
                error_message: Some("No se encontró el fichero ~/.kube/config".to_string()),
            };
        }

        // Ejecución de 'kubectl config current-context'
        let ctx_output = Command::new("kubectl")
            .args(["config", "current-context"])
            .output()
            .await;

        let current_context = match ctx_output {
            Ok(out) if out.status.success() => {
                String::from_utf8_lossy(&out.stdout).trim().to_string()
            }
            Ok(out) => {
                let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
                return K8sClusterStatus {
                    connected: false,
                    cluster_name: "Desconectado".to_string(),
                    current_context: "Desconocido".to_string(),
                    server_url: "N/A".to_string(),
                    total_pods: 0,
                    total_namespaces: 0,
                    error_message: Some(err),
                };
            }
            Err(e) => {
                return K8sClusterStatus {
                    connected: false,
                    cluster_name: "No disponible".to_string(),
                    current_context: "N/A".to_string(),
                    server_url: "N/A".to_string(),
                    total_pods: 0,
                    total_namespaces: 0,
                    error_message: Some(format!("kubectl no está instalado o accesible: {}", e)),
                };
            }
        };

        // Verificamos conexión viva con cluster-info
        let info_output = Command::new("kubectl")
            .args(["cluster-info"])
            .output()
            .await;

        let (connected, server_url, error_message) = match info_output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                // Extraer URL del control plane
                let url = stdout
                    .lines()
                    .next()
                    .and_then(|line| line.split("at ").nth(1))
                    .map(|u| u.trim().to_string())
                    .unwrap_or_else(|| "Local/Proxy".to_string());
                (true, url, None)
            }
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                (false, "Inaccesible".to_string(), Some(stderr))
            }
            Err(e) => (false, "Inaccesible".to_string(), Some(e.to_string())),
        };

        let pods = if connected {
            self.list_pods("").await.unwrap_or_default()
        } else {
            Vec::new()
        };

        let namespaces = if connected {
            self.list_namespaces().await.unwrap_or_default()
        } else {
            Vec::new()
        };

        K8sClusterStatus {
            connected,
            cluster_name: current_context.clone(),
            current_context,
            server_url,
            total_pods: pods.len(),
            total_namespaces: namespaces.len(),
            error_message,
        }
    }

    /// Lista todos los pods en un namespace específico o en todos (--all-namespaces).
    pub async fn list_pods(&self, namespace: &str) -> Result<Vec<PodSummary>, String> {
        let mut args = vec!["get", "pods", "-o", "json"];
        if namespace.is_empty() || namespace == "all" {
            args.push("--all-namespaces");
        } else {
            args.push("-n");
            args.push(namespace);
        }

        let output = Command::new("kubectl")
            .args(&args)
            .output()
            .await
            .map_err(|e| format!("Error invocando kubectl get pods: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Error en respuesta de kubectl: {}", err));
        }

        let json_val: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Error parseando JSON de pods: {}", e))?;

        let items = json_val
            .get("items")
            .and_then(|i| i.as_array())
            .cloned()
            .unwrap_or_default();

        let mut pods = Vec::new();
        for item in items {
            let metadata = item.get("metadata");
            let name = metadata
                .and_then(|m| m.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or("desconocido")
                .to_string();
            let ns = metadata
                .and_then(|m| m.get("namespace"))
                .and_then(|n| n.as_str())
                .unwrap_or("default")
                .to_string();
            let creation_timestamp = metadata
                .and_then(|m| m.get("creationTimestamp"))
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();

            let status_obj = item.get("status");
            let phase = status_obj
                .and_then(|s| s.get("phase"))
                .and_then(|p| p.as_str())
                .unwrap_or("Desconocido")
                .to_string();

            let pod_ip = status_obj
                .and_then(|s| s.get("podIP"))
                .and_then(|ip| ip.as_str())
                .unwrap_or("-")
                .to_string();

            let spec_obj = item.get("spec");
            let node = spec_obj
                .and_then(|s| s.get("nodeName"))
                .and_then(|n| n.as_str())
                .unwrap_or("-")
                .to_string();

            // Cálculo de contenedores Ready y Restarts
            let container_statuses = status_obj
                .and_then(|s| s.get("containerStatuses"))
                .and_then(|c| c.as_array());

            let mut ready_count = 0;
            let mut total_containers = 0;
            let mut restarts = 0;

            if let Some(statuses) = container_statuses {
                total_containers = statuses.len();
                for cs in statuses {
                    if cs.get("ready").and_then(|r| r.as_bool()).unwrap_or(false) {
                        ready_count += 1;
                    }
                    if let Some(r_cnt) = cs.get("restartCount").and_then(|r| r.as_i64()) {
                        restarts += r_cnt as i32;
                    }
                }
            }

            let ready_str = format!("{}/{}", ready_count, total_containers);

            pods.push(PodSummary {
                name,
                namespace: ns,
                status: phase,
                ready_containers: ready_str,
                restarts,
                age: creation_timestamp,
                node,
                ip: pod_ip,
                cpu_request: None,
                memory_request: None,
            });
        }

        Ok(pods)
    }

    /// Lista los namespaces existentes en el clúster.
    pub async fn list_namespaces(&self) -> Result<Vec<NamespaceSummary>, String> {
        let output = Command::new("kubectl")
            .args(["get", "namespaces", "-o", "json"])
            .output()
            .await
            .map_err(|e| format!("Error invocando kubectl get namespaces: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Error en respuesta de kubectl namespaces: {}", err));
        }

        let json_val: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Error parseando JSON de namespaces: {}", e))?;

        let items = json_val
            .get("items")
            .and_then(|i| i.as_array())
            .cloned()
            .unwrap_or_default();

        let mut namespaces = Vec::new();
        for item in items {
            let metadata = item.get("metadata");
            let name = metadata
                .and_then(|m| m.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or("desconocido")
                .to_string();
            let creation = metadata
                .and_then(|m| m.get("creationTimestamp"))
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();

            let status_phase = item
                .get("status")
                .and_then(|s| s.get("phase"))
                .and_then(|p| p.as_str())
                .unwrap_or("Active")
                .to_string();

            namespaces.push(NamespaceSummary {
                name,
                status: status_phase,
                age: creation,
            });
        }

        Ok(namespaces)
    }

    /// Obtiene las últimas líneas de logs de un Pod de Kubernetes.
    pub async fn get_pod_logs(&self, namespace: &str, pod_name: &str, tail: &str) -> Result<String, String> {
        let output = Command::new("kubectl")
            .args(["logs", pod_name, "-n", namespace, "--tail", tail])
            .output()
            .await
            .map_err(|e| format!("Error al obtener logs del pod '{}': {}", pod_name, e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Error de kubectl logs: {}", err));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Lista los nodos del clúster Kubernetes con su arquitectura detallada,
    /// métricas de capacidad, condiciones de salud y pods asignados.
    pub async fn list_nodes(&self) -> Result<Vec<NodeSummary>, String> {
        let output = Command::new("kubectl")
            .args(["get", "nodes", "-o", "json"])
            .output()
            .await
            .map_err(|e| format!("Error ejecutando kubectl get nodes: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Error en respuesta de kubectl get nodes: {}", err));
        }

        let json_val: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Error parseando JSON de nodos: {}", e))?;

        // Obtenemos todos los pods del clúster para calcular la carga asignada a cada nodo
        let all_pods = self.list_pods("").await.unwrap_or_default();

        Ok(Self::parse_nodes_json(&json_val, &all_pods))
    }

    /// Parsea la respuesta JSON estructurada de `kubectl get nodes -o json` a una lista de `NodeSummary`.
    /// Desacoplado como función pura para permitir pruebas unitarias deterministas sin requerir un clúster vivo.
    pub fn parse_nodes_json(json_val: &serde_json::Value, all_pods: &[PodSummary]) -> Vec<NodeSummary> {
        let items = json_val
            .get("items")
            .and_then(|i| i.as_array())
            .cloned()
            .unwrap_or_default();

        let mut nodes = Vec::new();

        for item in items {
            let metadata = item.get("metadata");
            let name = metadata
                .and_then(|m| m.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or("nodo-desconocido")
                .to_string();

            // Extracción de roles desde las etiquetas (labels)
            let mut roles = Vec::new();
            if let Some(labels) = metadata.and_then(|m| m.get("labels")).and_then(|l| l.as_object()) {
                for key in labels.keys() {
                    if let Some(role) = key.strip_prefix("node-role.kubernetes.io/") {
                        roles.push(role.to_string());
                    }
                }
            }
            if roles.is_empty() {
                roles.push("worker".to_string());
            }

            let status_obj = item.get("status");
            let spec_obj = item.get("spec");

            // Direcciones IP y Hostname
            let mut internal_ip = "-".to_string();
            let mut hostname = name.clone();
            if let Some(addresses) = status_obj.and_then(|s| s.get("addresses")).and_then(|a| a.as_array()) {
                for addr in addresses {
                    let addr_type = addr.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    let addr_val = addr.get("address").and_then(|a| a.as_str()).unwrap_or("");
                    if addr_type == "InternalIP" && internal_ip == "-" {
                        internal_ip = addr_val.to_string();
                    } else if addr_type == "Hostname" {
                        hostname = addr_val.to_string();
                    }
                }
            }

            // Información del sistema del nodo
            let node_info = status_obj.and_then(|s| s.get("nodeInfo"));
            let architecture = node_info
                .and_then(|ni| ni.get("architecture"))
                .and_then(|a| a.as_str())
                .unwrap_or("linux/amd64")
                .to_string();
            let container_runtime = node_info
                .and_then(|ni| ni.get("containerRuntimeVersion"))
                .and_then(|cr| cr.as_str())
                .unwrap_or("containerd")
                .to_string();
            let kernel_version = node_info
                .and_then(|ni| ni.get("kernelVersion"))
                .and_then(|kv| kv.as_str())
                .unwrap_or("-")
                .to_string();
            let kubelet_version = node_info
                .and_then(|ni| ni.get("kubeletVersion"))
                .and_then(|kv| kv.as_str())
                .unwrap_or("-")
                .to_string();
            let os_image = node_info
                .and_then(|ni| ni.get("osImage"))
                .and_then(|oi| oi.as_str())
                .unwrap_or("Linux")
                .to_string();

            // Capacidades de CPU, Memoria y Pods
            let capacity = status_obj.and_then(|s| s.get("capacity"));
            let cpu_capacity = capacity
                .and_then(|c| c.get("cpu"))
                .and_then(|cpu| cpu.as_str())
                .unwrap_or("0")
                .to_string();

            let raw_mem = capacity
                .and_then(|c| c.get("memory"))
                .and_then(|m| m.as_str())
                .unwrap_or("0Ki");

            let memory_capacity = if let Some(stripped) = raw_mem.strip_suffix("Ki") {
                if let Ok(ki) = stripped.parse::<f64>() {
                    let gb = ki / (1024.0 * 1024.0);
                    format!("{:.1} GB", gb)
                } else {
                    raw_mem.to_string()
                }
            } else {
                raw_mem.to_string()
            };

            let pods_capacity = capacity
                .and_then(|c| c.get("pods"))
                .and_then(|p| p.as_str())
                .and_then(|p| p.parse::<usize>().ok())
                .unwrap_or(110);

            // Condiciones de salud (Ready, MemoryPressure, DiskPressure, PIDPressure)
            let mut node_status = "Unknown".to_string();
            let mut conditions = Vec::new();

            if let Some(conds) = status_obj.and_then(|s| s.get("conditions")).and_then(|c| c.as_array()) {
                for cond in conds {
                    let c_type = cond.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string();
                    let c_status = cond.get("status").and_then(|s| s.as_str()).unwrap_or("").to_string();
                    let c_reason = cond.get("reason").and_then(|r| r.as_str()).unwrap_or("").to_string();
                    let c_msg = cond.get("message").and_then(|m| m.as_str()).unwrap_or("").to_string();

                    if c_type == "Ready" {
                        node_status = if c_status == "True" {
                            "Ready".to_string()
                        } else {
                            "NotReady".to_string()
                        };
                    }

                    conditions.push(NodeConditionSummary {
                        condition_type: c_type,
                        status: c_status,
                        reason: c_reason,
                        message: c_msg,
                    });
                }
            }

            // Conteo de pods asignados a este nodo
            let allocated_pods_count = all_pods
                .iter()
                .filter(|p| p.node == name || p.node == hostname)
                .count();

            // CIDR de pods del nodo
            let pod_cidr = spec_obj
                .and_then(|s| s.get("podCIDR"))
                .and_then(|c| c.as_str())
                .unwrap_or("-")
                .to_string();

            nodes.push(NodeSummary {
                name,
                status: node_status,
                roles,
                internal_ip,
                hostname,
                os_image,
                kernel_version,
                container_runtime,
                kubelet_version,
                architecture,
                cpu_capacity,
                memory_capacity,
                pods_capacity,
                allocated_pods_count,
                pod_cidr,
                conditions,
            });
        }

        nodes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_nodes_json_structure() {
        let raw_json = serde_json::json!({
            "items": [
                {
                    "metadata": {
                        "name": "worker-node-01",
                        "labels": {
                            "node-role.kubernetes.io/worker": "",
                            "kubernetes.io/hostname": "worker-node-01"
                        }
                    },
                    "spec": {
                        "podCIDR": "10.42.1.0/24"
                    },
                    "status": {
                        "addresses": [
                            {"type": "InternalIP", "address": "192.168.1.101"},
                            {"type": "Hostname", "address": "worker-node-01"}
                        ],
                        "capacity": {
                            "cpu": "8",
                            "memory": "16777216Ki", // 16 GB
                            "pods": "110"
                        },
                        "conditions": [
                            {
                                "type": "Ready",
                                "status": "True",
                                "reason": "KubeletReady",
                                "message": "kubelet is posting ready status"
                            }
                        ],
                        "nodeInfo": {
                            "architecture": "amd64",
                            "containerRuntimeVersion": "containerd://1.7.13",
                            "kernelVersion": "6.8.0-45-generic",
                            "kubeletVersion": "v1.30.2+k3s1",
                            "osImage": "Ubuntu 24.04 LTS"
                        }
                    }
                }
            ]
        });

        let pods = vec![
            PodSummary {
                name: "api-gw-1".to_string(),
                namespace: "default".to_string(),
                status: "Running".to_string(),
                ready_containers: "1/1".to_string(),
                restarts: 0,
                age: "2d".to_string(),
                node: "worker-node-01".to_string(),
                ip: "10.42.1.15".to_string(),
                cpu_request: None,
                memory_request: None,
            },
            PodSummary {
                name: "cache-redis-1".to_string(),
                namespace: "default".to_string(),
                status: "Running".to_string(),
                ready_containers: "1/1".to_string(),
                restarts: 0,
                age: "2d".to_string(),
                node: "worker-node-01".to_string(),
                ip: "10.42.1.16".to_string(),
                cpu_request: None,
                memory_request: None,
            },
            PodSummary {
                name: "other-pod".to_string(),
                namespace: "default".to_string(),
                status: "Running".to_string(),
                ready_containers: "1/1".to_string(),
                restarts: 0,
                age: "1d".to_string(),
                node: "control-plane-01".to_string(),
                ip: "10.42.0.5".to_string(),
                cpu_request: None,
                memory_request: None,
            },
        ];

        let nodes = K8sEngine::parse_nodes_json(&raw_json, &pods);
        assert_eq!(nodes.len(), 1);

        let node = &nodes[0];
        assert_eq!(node.name, "worker-node-01");
        assert_eq!(node.status, "Ready");
        assert_eq!(node.roles, vec!["worker"]);
        assert_eq!(node.internal_ip, "192.168.1.101");
        assert_eq!(node.cpu_capacity, "8");
        assert_eq!(node.memory_capacity, "16.0 GB");
        assert_eq!(node.pods_capacity, 110);
        assert_eq!(node.allocated_pods_count, 2);
        assert_eq!(node.pod_cidr, "10.42.1.0/24");
        assert_eq!(node.container_runtime, "containerd://1.7.13");
        assert_eq!(node.conditions.len(), 1);
        assert_eq!(node.conditions[0].condition_type, "Ready");
    }
}
