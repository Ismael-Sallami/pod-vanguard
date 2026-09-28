// ==============================================================================
// PodVanguard - Enrutador API REST y Servidor de Activos Embebidos
// Autor: Ismael Sallami Moreno <ismEngineer23@gmail.com>
//
// Este módulo define los endpoints REST bajo el prefijo /api, los túneles WebSocket
// bajo /ws, y el middleware de entrega de activos estáticos embebidos en el binario
// mediante include_dir (Single-Page Application con fallback a index.html).
// ==============================================================================

use axum::{
    extract::{Path as AxPath, Query, State, WebSocketUpgrade},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use sysinfo::System;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

use crate::docker::{ContainerDetail, ContainerStats, ContainerSummary, DockerEngine, ImageSummary, NetworkSummary, VolumeSummary};
use crate::k8s::{K8sClusterStatus, K8sEngine, NamespaceSummary, PodSummary};
use crate::pruner::{DiskReclaimEstimate, PruneExecutionReport, PrunerEngine};
use crate::sentinel::{audit_containers, ContainerSecurityContext, SentinelAuditReport};
use crate::topology::{TopologyEngine, TopologyGraph};
use crate::ws::{handle_exec_websocket, handle_logs_websocket, handle_stats_websocket};

/// Directorio de interfaz web embebido en tiempo de compilación (Vite + React 19).
static WEB_ASSETS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/web/dist");

/// Estado global compartido de la aplicación Axum.
#[derive(Clone)]
pub struct AppState {
    pub docker: DockerEngine,
    pub k8s: K8sEngine,
    pub pruner: Arc<PrunerEngine>,
    pub topology: Arc<TopologyEngine>,
    pub sys: Arc<Mutex<System>>,
}

/// Respuesta JSON estándar para operaciones de mutación.
#[derive(Serialize)]
pub struct ActionResponse {
    pub success: bool,
    pub message: String,
}

/// Query params opcionales para listas o filtros.
#[derive(Deserialize)]
pub struct ListFilterQuery {
    pub all: Option<bool>,
    pub namespace: Option<String>,
    pub tail: Option<String>,
    pub filter: Option<String>,
    pub force: Option<bool>,
}

/// Métrica del host y estado general de la plataforma.
#[derive(Serialize)]
pub struct HostSystemStatus {
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub host_name: String,
    pub uptime_seconds: u64,
    pub cpu_count: usize,
    pub cpu_usage_percent: f32,
    pub memory_total_bytes: u64,
    pub memory_used_bytes: u64,
    pub memory_usage_percent: f64,
    pub docker_connected: bool,
    pub docker_ping: String,
    pub k8s_status: K8sClusterStatus,
}

/// Crea el enrutador principal de PodVanguard.
pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // API del Sistema y Métricas
        .route("/api/system/status", get(get_system_status))
        // API de Contenedores Docker
        .route("/api/docker/containers", get(list_containers))
        .route("/api/docker/containers/:id", get(inspect_container))
        .route("/api/docker/containers/:id/:action", post(container_action))
        .route("/api/docker/containers/:id/stats", get(get_container_stats))
        .route("/api/docker/containers/:id/logs", get(get_container_logs))
        // API de Imágenes
        .route("/api/docker/images", get(list_images))
        .route("/api/docker/images/:id", delete(remove_image))
        // API de Volúmenes y Redes
        .route("/api/docker/volumes", get(list_volumes))
        .route("/api/docker/networks", get(list_networks))
        // API de Kubernetes
        .route("/api/k8s/status", get(get_k8s_status))
        .route("/api/k8s/pods", get(list_k8s_pods))
        .route("/api/k8s/namespaces", get(list_k8s_namespaces))
        .route("/api/k8s/pods/:namespace/:name/logs", get(get_k8s_pod_logs))
        // API de Sentinel Shield (Seguridad)
        .route("/api/sentinel/audit", get(run_sentinel_audit))
        // API de Pruner (Limpieza de Disco)
        .route("/api/pruner/scan", get(pruner_scan))
        .route("/api/pruner/clean", post(pruner_clean))
        // API de Topología Interactiva
        .route("/api/topology", get(get_topology))
        // WebSockets
        .route("/ws/exec/:id", get(ws_exec_handler))
        .route("/ws/logs/:id", get(ws_logs_handler))
        .route("/ws/stats", get(ws_stats_handler))
        // Entrega de interfaz web embebida (Single Page Application)
        .fallback(serve_embedded_asset)
        .layer(cors)
        .with_state(state)
}

// ==============================================================================
// Controladores REST
// ==============================================================================

async fn get_system_status(State(state): State<AppState>) -> Json<HostSystemStatus> {
    let mut sys = state.sys.lock().await;
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let uptime = System::uptime();
    let cpu_count = sys.cpus().len();
    let cpu_usage = sys.global_cpu_usage();
    let mem_total = sys.total_memory();
    let mem_used = sys.used_memory();
    let mem_pct = if mem_total > 0 {
        ((mem_used as f64 / mem_total as f64) * 1000.0).round() / 10.0
    } else {
        0.0
    };

    drop(sys);

    let (docker_conn, docker_ping) = match state.docker.ping().await {
        Ok(msg) => (true, msg),
        Err(e) => (false, e),
    };

    let k8s_status = state.k8s.get_cluster_status().await;

    Json(HostSystemStatus {
        os_name: System::name().unwrap_or_else(|| "Linux".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Genérico".to_string()),
        kernel_version: System::kernel_version().unwrap_or_else(|| "N/A".to_string()),
        host_name: System::host_name().unwrap_or_else(|| "localhost".to_string()),
        uptime_seconds: uptime,
        cpu_count,
        cpu_usage_percent: (cpu_usage * 10.0).round() / 10.0,
        memory_total_bytes: mem_total,
        memory_used_bytes: mem_used,
        memory_usage_percent: mem_pct,
        docker_connected: docker_conn,
        docker_ping,
        k8s_status,
    })
}

async fn list_containers(
    State(state): State<AppState>,
    Query(query): Query<ListFilterQuery>,
) -> Result<Json<Vec<ContainerSummary>>, (StatusCode, String)> {
    let show_all = query.all.unwrap_or(true);
    state
        .docker
        .list_containers(show_all)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn inspect_container(
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
) -> Result<Json<ContainerDetail>, (StatusCode, String)> {
    state
        .docker
        .inspect_container(&id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::NOT_FOUND, e))
}

async fn container_action(
    State(state): State<AppState>,
    AxPath((id, action)): AxPath<(String, String)>,
    Query(query): Query<ListFilterQuery>,
) -> Result<Json<ActionResponse>, (StatusCode, String)> {
    let res = match action.to_lowercase().as_str() {
        "start" => state.docker.start_container(&id).await,
        "stop" => state.docker.stop_container(&id, 10).await,
        "restart" => state.docker.restart_container(&id, 10).await,
        "pause" => state.docker.pause_container(&id).await,
        "unpause" => state.docker.unpause_container(&id).await,
        "remove" => state.docker.remove_container(&id, query.force.unwrap_or(false)).await,
        other => return Err((StatusCode::BAD_REQUEST, format!("Acción desconocida: {}", other))),
    };

    match res {
        Ok(_) => Ok(Json(ActionResponse {
            success: true,
            message: format!("Acción '{}' completada sobre el contenedor '{}'", action, id),
        })),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

async fn get_container_stats(
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
) -> Result<Json<ContainerStats>, (StatusCode, String)> {
    state
        .docker
        .get_container_stats(&id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn get_container_logs(
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
    Query(query): Query<ListFilterQuery>,
) -> Result<String, (StatusCode, String)> {
    let tail = query.tail.unwrap_or_else(|| "100".to_string());
    state
        .docker
        .get_logs(&id, &tail)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn list_images(
    State(state): State<AppState>,
) -> Result<Json<Vec<ImageSummary>>, (StatusCode, String)> {
    state
        .docker
        .list_images()
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn remove_image(
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
    Query(query): Query<ListFilterQuery>,
) -> Result<Json<ActionResponse>, (StatusCode, String)> {
    let force = query.force.unwrap_or(false);
    state
        .docker
        .remove_image(&id, force)
        .await
        .map(|_| {
            Json(ActionResponse {
                success: true,
                message: format!("Imagen '{}' eliminada con éxito", id),
            })
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn list_volumes(
    State(state): State<AppState>,
) -> Result<Json<Vec<VolumeSummary>>, (StatusCode, String)> {
    state
        .docker
        .list_volumes()
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn list_networks(
    State(state): State<AppState>,
) -> Result<Json<Vec<NetworkSummary>>, (StatusCode, String)> {
    state
        .docker
        .list_networks()
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn get_k8s_status(State(state): State<AppState>) -> Json<K8sClusterStatus> {
    let status = state.k8s.get_cluster_status().await;
    Json(status)
}

async fn list_k8s_pods(
    State(state): State<AppState>,
    Query(query): Query<ListFilterQuery>,
) -> Result<Json<Vec<PodSummary>>, (StatusCode, String)> {
    let ns = query.namespace.unwrap_or_default();
    state
        .k8s
        .list_pods(&ns)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn list_k8s_namespaces(
    State(state): State<AppState>,
) -> Result<Json<Vec<NamespaceSummary>>, (StatusCode, String)> {
    state
        .k8s
        .list_namespaces()
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn get_k8s_pod_logs(
    State(state): State<AppState>,
    AxPath((namespace, name)): AxPath<(String, String)>,
    Query(query): Query<ListFilterQuery>,
) -> Result<String, (StatusCode, String)> {
    let tail = query.tail.unwrap_or_else(|| "100".to_string());
    state
        .k8s
        .get_pod_logs(&namespace, &name, &tail)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn run_sentinel_audit(
    State(state): State<AppState>,
) -> Result<Json<SentinelAuditReport>, (StatusCode, String)> {
    let containers = state
        .docker
        .list_containers(true)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let mut contexts = Vec::new();
    for c in containers {
        if let Ok(detail) = state.docker.inspect_container(&c.id).await {
            let exposed = detail
                .ports
                .into_iter()
                .filter_map(|p| {
                    p.container_port
                        .parse::<u16>()
                        .ok()
                        .map(|port| (port, p.host_ip))
                })
                .collect();

            contexts.push(ContainerSecurityContext {
                id: detail.id,
                name: detail.name,
                env_vars: detail.env,
                user: None,
                privileged: detail.privileged,
                memory_limit_bytes: detail.memory_limit,
                exposed_ports: exposed,
                read_only_rootfs: false,
            });
        }
    }

    let report = audit_containers(&contexts);
    Ok(Json(report))
}

async fn pruner_scan(
    State(state): State<AppState>,
) -> Result<Json<DiskReclaimEstimate>, (StatusCode, String)> {
    state
        .pruner
        .scan_reclaimable()
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn pruner_clean(
    State(state): State<AppState>,
) -> Result<Json<PruneExecutionReport>, (StatusCode, String)> {
    state
        .pruner
        .prune_all()
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn get_topology(
    State(state): State<AppState>,
) -> Result<Json<TopologyGraph>, (StatusCode, String)> {
    state
        .topology
        .generate_graph()
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

// ==============================================================================
// Handlers WebSocket
// ==============================================================================

async fn ws_exec_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
) -> Response {
    let docker_client = state.docker.raw_client().clone();
    ws.on_upgrade(move |socket| handle_exec_websocket(socket, docker_client, id))
}

async fn ws_logs_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
    Query(query): Query<ListFilterQuery>,
) -> Response {
    let docker_client = state.docker.raw_client().clone();
    let filter = query.filter;
    ws.on_upgrade(move |socket| handle_logs_websocket(socket, docker_client, id, filter))
}

async fn ws_stats_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    let sys_arc = state.sys.clone();
    ws.on_upgrade(move |socket| handle_stats_websocket(socket, sys_arc))
}

// ==============================================================================
// Entrega de Activos Estáticos Embebidos
// ==============================================================================

fn guess_mime_type(path: &str) -> &'static str {
    if path.ends_with(".html") || path.ends_with(".htm") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".js") || path.ends_with(".mjs") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else {
        "application/octet-stream"
    }
}

async fn serve_embedded_asset(uri: axum::http::Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let target_path = if path.is_empty() { "index.html" } else { path };

    // Intentar buscar el archivo exacto solicitado
    if let Some(file) = WEB_ASSETS.get_file(target_path) {
        let mime = guess_mime_type(target_path);
        return (
            StatusCode::OK,
            [(header::CONTENT_TYPE, HeaderValue::from_static(mime))],
            file.contents().to_vec(),
        );
    }

    // Fallback a index.html para routing SPA
    if let Some(index) = WEB_ASSETS.get_file("index.html") {
        return (
            StatusCode::OK,
            [(header::CONTENT_TYPE, HeaderValue::from_static("text/html; charset=utf-8"))],
            index.contents().to_vec(),
        );
    }

    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, HeaderValue::from_static("text/plain"))],
        b"404 Not Found - PodVanguard Assets Missing".to_vec(),
    )
}
