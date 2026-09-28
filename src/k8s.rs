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
}
