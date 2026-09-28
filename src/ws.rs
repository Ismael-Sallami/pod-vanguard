// ==============================================================================
// PodVanguard - Motor de WebSockets en Tiempo Real (Terminal PTY, Logs, Métricas)
// Autor: Ismael Sallami Moreno <ismEngineer23@gmail.com>
//
// Este módulo gestiona los canales bidireccionales WebSocket sobre Axum:
// 1. Terminal interactivo en vivo conectando un frontend Xterm.js con un contenedor
//    a través de la API bollard::exec con emulación TTY y redimensionamiento dinámico.
// 2. Transmisión continua de logs (Follow Logs) con capacidad de filtrado por Regex.
// 3. Telemetría de métricas del host y contenedores en tiempo real.
// ==============================================================================

use axum::extract::ws::{Message, WebSocket};
use bollard::container::LogsOptions;
use bollard::exec::{CreateExecOptions, ResizeExecOptions, StartExecOptions, StartExecResults};
use bollard::Docker;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::sync::Arc;
use sysinfo::System;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

/// Mensaje de control de redimensionamiento de terminal enviado por Xterm.js.
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum WsClientMessage {
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
    #[serde(rename = "input")]
    Input { data: String },
}

/// Gestiona la sesión de terminal interactiva completa para un contenedor.
pub async fn handle_exec_websocket(socket: WebSocket, docker: Docker, container_id: String) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Intentamos abrir /bin/bash; si no existe, probamos /bin/sh
    let create_options = CreateExecOptions {
        attach_stdin: Some(true),
        attach_stdout: Some(true),
        attach_stderr: Some(true),
        tty: Some(true),
        cmd: Some(vec!["/bin/sh"]),
        env: Some(vec![
            "TERM=xterm-256color",
            "COLORTERM=truecolor",
        ]),
        ..Default::default()
    };

    let exec_inst = match docker.create_exec(&container_id, create_options).await {
        Ok(exec) => exec,
        Err(e) => {
            let _ = ws_sender
                .send(Message::Text(format!(
                    "\r\n\x1b[31m[PodVanguard] Error creando sesión exec: {}\x1b[0m\r\n",
                    e
                )))
                .await;
            return;
        }
    };

    let exec_id = exec_inst.id;

    let start_options = StartExecOptions {
        detach: false,
        tty: true,
        output_capacity: None,
    };

    let (mut exec_output, mut exec_input) = match docker.start_exec(&exec_id, Some(start_options)).await {
        Ok(StartExecResults::Attached { output, input }) => (output, input),
        Ok(StartExecResults::Detached) => {
            let _ = ws_sender
                .send(Message::Text(
                    "\r\n\x1b[31m[PodVanguard] Modo detached no soportado para terminal interactivo\x1b[0m\r\n"
                        .to_string(),
                ))
                .await;
            return;
        }
        Err(e) => {
            let _ = ws_sender
                .send(Message::Text(format!(
                    "\r\n\x1b[31m[PodVanguard] Error iniciando exec: {}\x1b[0m\r\n",
                    e
                )))
                .await;
            return;
        }
    };

    // Tarea 1: De Exec stdout/stderr hacia el cliente WebSocket
    let mut ws_sender_task = tokio::spawn(async move {
        while let Some(chunk_res) = exec_output.next().await {
            match chunk_res {
                Ok(chunk) => {
                    let bytes = chunk.into_bytes();
                    if ws_sender.send(Message::Binary(bytes.to_vec())).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Tarea 2: Del cliente WebSocket hacia Exec stdin y control de Resize
    let docker_clone = docker.clone();
    let exec_id_clone = exec_id.clone();

    let mut ws_receiver_task = tokio::spawn(async move {
        while let Some(msg_res) = ws_receiver.next().await {
            match msg_res {
                Ok(Message::Text(text)) => {
                    // Verificamos si es un mensaje de control JSON (ej: resize)
                    if let Ok(ctrl) = serde_json::from_str::<WsClientMessage>(&text) {
                        match ctrl {
                            WsClientMessage::Resize { cols, rows } => {
                                let resize_opts = ResizeExecOptions {
                                    height: rows,
                                    width: cols,
                                };
                                let _ = docker_clone.resize_exec(&exec_id_clone, resize_opts).await;
                            }
                            WsClientMessage::Input { data } => {
                                if exec_input.write_all(data.as_bytes()).await.is_err() {
                                    break;
                                }
                                let _ = exec_input.flush().await;
                            }
                        }
                    } else {
                        // Entrada de texto estándar directa
                        if exec_input.write_all(text.as_bytes()).await.is_err() {
                            break;
                        }
                        let _ = exec_input.flush().await;
                    }
                }
                Ok(Message::Binary(bin)) => {
                    if exec_input.write_all(&bin).await.is_err() {
                        break;
                    }
                    let _ = exec_input.flush().await;
                }
                Ok(Message::Close(_)) => break,
                Err(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = (&mut ws_sender_task) => {
            ws_receiver_task.abort();
        }
        _ = (&mut ws_receiver_task) => {
            ws_sender_task.abort();
        }
    }
}

/// Transmite logs continuos en tiempo real hacia el cliente WebSocket.
pub async fn handle_logs_websocket(
    socket: WebSocket,
    docker: Docker,
    container_id: String,
    filter_pattern: Option<String>,
) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let regex_filter = filter_pattern.as_ref().and_then(|pat| {
        if pat.trim().is_empty() {
            None
        } else {
            regex::Regex::new(pat).ok()
        }
    });

    let options = Some(LogsOptions::<String> {
        follow: true,
        stdout: true,
        stderr: true,
        tail: "200".to_string(),
        timestamps: true,
        ..Default::default()
    });

    let mut log_stream = docker.logs(&container_id, options);

    let mut stream_task = tokio::spawn(async move {
        while let Some(item) = log_stream.next().await {
            match item {
                Ok(log_output) => {
                    let text = log_output.to_string();
                    let send_it = match &regex_filter {
                        Some(re) => re.is_match(&text),
                        None => true,
                    };

                    if send_it {
                        if ws_sender.send(Message::Text(text)).await.is_err() {
                            break;
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });

    let mut client_task = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            if let Ok(Message::Close(_)) = msg {
                break;
            }
        }
    });

    tokio::select! {
        _ = (&mut stream_task) => {
            client_task.abort();
        }
        _ = (&mut client_task) => {
            stream_task.abort();
        }
    }
}

/// Transmite telemetría del host y métricas de contenedores a intervalos regulares.
pub async fn handle_stats_websocket(
    socket: WebSocket,
    sys_mutex: Arc<Mutex<System>>,
) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let mut ticker = tokio::time::interval(std::time::Duration::from_millis(1500));

    let mut stats_task = tokio::spawn(async move {
        loop {
            ticker.tick().await;

            let (cpu_usage, mem_used, mem_total) = {
                let mut sys = sys_mutex.lock().await;
                sys.refresh_cpu_all();
                sys.refresh_memory();

                let cpu_usage = sys.global_cpu_usage();
                let mem_used = sys.used_memory();
                let mem_total = sys.total_memory();
                (cpu_usage, mem_used, mem_total)
            };

            let payload = serde_json::json!({
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "host": {
                    "cpu_usage_percent": (cpu_usage * 10.0).round() / 10.0,
                    "memory_used_bytes": mem_used,
                    "memory_total_bytes": mem_total,
                    "memory_percent": if mem_total > 0 { ((mem_used as f64 / mem_total as f64) * 1000.0).round() / 10.0 } else { 0.0 }
                }
            });

            if ws_sender
                .send(Message::Text(payload.to_string()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    let mut client_task = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            if let Ok(Message::Close(_)) = msg {
                break;
            }
        }
    });

    tokio::select! {
        _ = (&mut stats_task) => {
            client_task.abort();
        }
        _ = (&mut client_task) => {
            stats_task.abort();
        }
    }
}
