// ==============================================================================
// PodVanguard - Motor de Limpieza Inteligente de Disco (Pruner)
// Autor: Ismael Sallami Moreno <ismEngineer23@gmail.com>
//
// Este módulo analiza el consumo de almacenamiento residual en el subsistema de
// contenedores: capas huérfanas, imágenes sin etiquetar (dangling), volúmenes
// desconectados, contenedores en estado detenido y caché de compilación (BuildKit).
// Proporciona cálculo exacto de espacio recuperable y rutinas seguras de purga.
// ==============================================================================

use bollard::container::PruneContainersOptions;
use bollard::image::PruneImagesOptions;
use bollard::volume::PruneVolumesOptions;
use bollard::Docker;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Resumen del espacio en disco recuperable por categoría.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskReclaimEstimate {
    pub stopped_containers_count: usize,
    pub stopped_containers_size_bytes: i64,
    pub dangling_images_count: usize,
    pub dangling_images_size_bytes: i64,
    pub dangling_volumes_count: usize,
    pub dangling_volumes_size_bytes: i64,
    pub total_reclaimable_bytes: i64,
    pub total_reclaimable_human: String,
}

/// Resultado de una operación de limpieza ejecutada.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PruneExecutionReport {
    pub containers_deleted: Vec<String>,
    pub space_reclaimed_containers_bytes: i64,
    pub images_deleted: Vec<String>,
    pub space_reclaimed_images_bytes: i64,
    pub volumes_deleted: Vec<String>,
    pub space_reclaimed_volumes_bytes: i64,
    pub total_reclaimed_bytes: i64,
    pub total_reclaimed_human: String,
}

/// Convierte una cantidad de bytes a una representación legible con unidades binarias (B, KB, MB, GB).
pub fn format_bytes(bytes: i64) -> String {
    if bytes < 0 {
        return "0 B".to_string();
    }
    let b = bytes as f64;
    const KB: f64 = 1024.0;
    const MB: f64 = 1024.0 * 1024.0;
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;

    if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.2} MB", b / MB)
    } else if b >= KB {
        format!("{:.2} KB", b / KB)
    } else {
        format!("{} B", bytes)
    }
}

/// Gestor del motor de poda y saneamiento de almacenamiento.
pub struct PrunerEngine {
    client: Docker,
}

impl PrunerEngine {
    pub fn new(client: Docker) -> Self {
        Self { client }
    }

    /// Analiza los recursos en desuso y calcula el espacio recuperable.
    pub async fn scan_reclaimable(&self) -> Result<DiskReclaimEstimate, String> {
        let df_info = self
            .client
            .df()
            .await
            .map_err(|e| format!("Error consultando uso de disco a Docker (df): {}", e))?;

        let mut stopped_containers_count = 0;
        let mut stopped_containers_size = 0i64;

        if let Some(containers) = df_info.containers {
            for c in containers {
                let is_running = c
                    .state
                    .map(|s| s.to_lowercase() == "running")
                    .unwrap_or(false);
                if !is_running {
                    stopped_containers_count += 1;
                    stopped_containers_size += c.size_rw.unwrap_or(0);
                }
            }
        }

        let mut dangling_images_count = 0;
        let mut dangling_images_size = 0i64;

        if let Some(images) = df_info.images {
            for img in images {
                // Si containers count == 0 o tags están vacías/dangling
                let containers_using = img.containers;
                if containers_using == 0 {
                    dangling_images_count += 1;
                    dangling_images_size += img.size;
                }
            }
        }

        let mut dangling_volumes_count = 0;
        let mut dangling_volumes_size = 0i64;

        if let Some(volumes) = df_info.volumes {
            for vol in volumes {
                if vol.usage_data.as_ref().map(|u| u.ref_count).unwrap_or(0) == 0 {
                    dangling_volumes_count += 1;
                    dangling_volumes_size += vol.usage_data.as_ref().map(|u| u.size).unwrap_or(0);
                }
            }
        }

        let total_bytes = stopped_containers_size + dangling_images_size + dangling_volumes_size;

        Ok(DiskReclaimEstimate {
            stopped_containers_count,
            stopped_containers_size_bytes: stopped_containers_size,
            dangling_images_count,
            dangling_images_size_bytes: dangling_images_size,
            dangling_volumes_count,
            dangling_volumes_size_bytes: dangling_volumes_size,
            total_reclaimable_bytes: total_bytes,
            total_reclaimable_human: format_bytes(total_bytes),
        })
    }

    /// Ejecuta el saneamiento completo de contenedores detenidos, imágenes huérfanas y volúmenes sin atar.
    pub async fn prune_all(&self) -> Result<PruneExecutionReport, String> {
        let empty_filters: HashMap<String, Vec<String>> = HashMap::new();

        // 1. Poda de contenedores detenidos
        let container_res = self
            .client
            .prune_containers(Some(PruneContainersOptions {
                filters: empty_filters.clone(),
            }))
            .await
            .map_err(|e| format!("Error en prune_containers: {}", e))?;

        let containers_deleted = container_res.containers_deleted.unwrap_or_default();
        let space_reclaimed_containers = container_res.space_reclaimed.unwrap_or(0);

        // 2. Poda de imágenes dangling
        let image_res = self
            .client
            .prune_images(Some(PruneImagesOptions {
                filters: empty_filters.clone(),
            }))
            .await
            .map_err(|e| format!("Error en prune_images: {}", e))?;

        let mut images_deleted = Vec::new();
        if let Some(deleted_items) = image_res.images_deleted {
            for item in deleted_items {
                if let Some(del) = item.deleted {
                    images_deleted.push(del);
                } else if let Some(untag) = item.untagged {
                    images_deleted.push(untag);
                }
            }
        }
        let space_reclaimed_images = image_res.space_reclaimed.unwrap_or(0);

        // 3. Poda de volúmenes dangling
        let volume_res = self
            .client
            .prune_volumes(Some(PruneVolumesOptions {
                filters: empty_filters,
            }))
            .await
            .map_err(|e| format!("Error en prune_volumes: {}", e))?;

        let volumes_deleted = volume_res.volumes_deleted.unwrap_or_default();
        let space_reclaimed_volumes = volume_res.space_reclaimed.unwrap_or(0);

        let total_reclaimed =
            space_reclaimed_containers + space_reclaimed_images + space_reclaimed_volumes;

        Ok(PruneExecutionReport {
            containers_deleted,
            space_reclaimed_containers_bytes: space_reclaimed_containers,
            images_deleted,
            space_reclaimed_images_bytes: space_reclaimed_images,
            volumes_deleted,
            space_reclaimed_volumes_bytes: space_reclaimed_volumes,
            total_reclaimed_bytes: total_reclaimed,
            total_reclaimed_human: format_bytes(total_reclaimed as i64),
        })
    }
}
