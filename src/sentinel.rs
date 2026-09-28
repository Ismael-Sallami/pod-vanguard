// ==============================================================================
// PodVanguard - Sentinel Shield for Containers & Pods
// Autor: Ismael Sallami Moreno <ismEngineer23@gmail.com>
// Motor de auditoría heurística y análisis proactivo de seguridad para contenedores.
// Detecta secretos en variables de entorno, banderas privilegiadas, ejecución como root,
// puertos expuestos en 0.0.0.0 y ausencia de cuotas de recursos (riesgo OOM).
// ==============================================================================

use regex::Regex;
use serde::{Deserialize, Serialize};

/// Nivel de gravedad del hallazgo de seguridad.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Severity {
    Critical,
    Warning,
    Info,
    Safe,
}

/// Representa una vulnerabilidad o mala práctica detectada en un contenedor o pod.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityFinding {
    pub container_id: String,
    pub container_name: String,
    pub rule_id: String,
    pub title: String,
    pub description: String,
    pub severity: Severity,
    pub remediation: String,
}

/// Informe consolidado de seguridad emitido por Sentinel Shield.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentinelAuditReport {
    pub score: u32, // Puntuación de 0 a 100
    pub total_inspected: usize,
    pub critical_count: usize,
    pub warning_count: usize,
    pub info_count: usize,
    pub findings: Vec<SecurityFinding>,
}

/// Reglas heurísticas compiladas para la detección de credenciales en variables de entorno.
struct SecretRule {
    id: &'static str,
    title: &'static str,
    regex: Regex,
}

impl SecretRule {
    fn new(id: &'static str, title: &'static str, pattern: &str) -> Self {
        Self {
            id,
            title,
            regex: Regex::new(pattern).expect("Expresión regular de regla Sentinel inválida"),
        }
    }
}

/// Configuración inspeccionada de un contenedor para auditoría.
#[derive(Debug, Clone)]
pub struct ContainerSecurityContext {
    pub id: String,
    pub name: String,
    pub env_vars: Vec<String>,
    pub user: Option<String>,
    pub privileged: bool,
    pub memory_limit_bytes: i64,
    pub exposed_ports: Vec<(u16, String)>, // (puerto, host_ip ej: "0.0.0.0")
    pub read_only_rootfs: bool,
}

/// Inicializa el conjunto de reglas de inspección profunda de credenciales.
fn get_secret_rules() -> Vec<SecretRule> {
    vec![
        SecretRule::new(
            "SEC-001",
            "Clave Privada de AWS (Secret Access Key)",
            r"(?i)aws_secret_access_key\s*=\s*['\x22]?([A-Za-z0-9/+=]{40})['\x22]?",
        ),
        SecretRule::new(
            "SEC-002",
            "Token de OpenAI / Inteligencia Artificial",
            r"sk-[A-Za-z0-9-_]{20,}",
        ),
        SecretRule::new(
            "SEC-003",
            "Token de Acceso Personal de GitHub (PAT)",
            r"gh[pousr]-[A-Za-z0-9_]{36,}",
        ),
        SecretRule::new(
            "SEC-004",
            "Clave Privada Criptográfica (RSA/EC/SSH)",
            r"-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----",
        ),
        SecretRule::new(
            "SEC-005",
            "Contraseña en Texto Plano en Variable de Entorno",
            r"(?i)(password|passwd|db_pass|database_password)\s*=\s*['\x22]?([^'\x22\s]{6,})['\x22]?",
        ),
        SecretRule::new(
            "SEC-006",
            "Clave Secreta de Stripe",
            r"sk_(live|test)_[0-9a-zA-Z]{24,}",
        ),
    ]
}

/// Lista de puertos de bases de datos y depuración que nunca deben exponerse a 0.0.0.0 sin protección.
static SENSITIVE_PORTS: &[(u16, &str)] = &[
    (2375, "Docker Daemon Socket sin cifrar"),
    (5432, "PostgreSQL Database Engine"),
    (3306, "MySQL / MariaDB Database"),
    (6379, "Redis In-Memory Data Store"),
    (27017, "MongoDB Database Server"),
    (9229, "Node.js V8 Debugger Inspector"),
    (5005, "Java JDWP Remote Debugger"),
    (9000, "PHP-FPM FastCGI Port"),
];

/// Ejecuta una auditoría completa sobre un conjunto de contenedores y genera un informe detallado.
pub fn audit_containers(containers: &[ContainerSecurityContext]) -> SentinelAuditReport {
    let rules = get_secret_rules();
    let mut findings = Vec::new();

    for c in containers {
        // 1. Detección de Secretos en Variables de Entorno
        for env in &c.env_vars {
            for rule in &rules {
                if rule.regex.is_match(env) {
                    findings.push(SecurityFinding {
                        container_id: c.id.clone(),
                        container_name: c.name.clone(),
                        rule_id: rule.id.to_string(),
                        title: rule.title.to_string(),
                        description: format!(
                            "Variable de entorno sensible detectada en el contenedor '{}'. Las credenciales no deben definirse en texto plano.",
                            c.name
                        ),
                        severity: Severity::Critical,
                        remediation: "Utiliza Docker Secrets, HashiCorp Vault o monta las credenciales como volúmenes cifrados temporales (tmpfs).".to_string(),
                    });
                    break;
                }
            }
        }

        // 2. Ejecución con Flag Privilegiado (--privileged)
        if c.privileged {
            findings.push(SecurityFinding {
                container_id: c.id.clone(),
                container_name: c.name.clone(),
                rule_id: "SEC-PRIV".to_string(),
                title: "Contenedor en Modo Privilegiado".to_string(),
                description: format!(
                    "El contenedor '{}' se ejecuta con privilegios totales del host (--privileged=true). Permite acceso directo al kernel y dispositivos físicos.",
                    c.name
                ),
                severity: Severity::Critical,
                remediation: "Elimina el flag --privileged y concede únicamente las capacidades estrictamente necesarias mediante '--cap-add' (ej: CAP_NET_BIND_SERVICE).".to_string(),
            });
        }

        // 3. Ejecución como Usuario Root (UID 0)
        let is_root = match &c.user {
            None => true,
            Some(u) => u.trim().is_empty() || u == "root" || u == "0",
        };
        if is_root && !c.privileged {
            findings.push(SecurityFinding {
                container_id: c.id.clone(),
                container_name: c.name.clone(),
                rule_id: "SEC-ROOT".to_string(),
                title: "Ejecución bajo Usuario Root (UID 0)".to_string(),
                description: format!(
                    "El contenedor '{}' ejecuta su proceso principal como root sin reasignación de espacio de usuarios (user namespace).",
                    c.name
                ),
                severity: Severity::Warning,
                remediation: "Define un usuario no privilegiado en el Dockerfile ('USER nonroot:nonroot') o mediante el parámetro '--user 1000:1000'.".to_string(),
            });
        }

        // 4. Puertos Sensibles Expuestos a Todas las Interfaces (0.0.0.0)
        for (port, host_ip) in &c.exposed_ports {
            if host_ip == "0.0.0.0" || host_ip.is_empty() || host_ip == "::" {
                if let Some((_, service)) = SENSITIVE_PORTS.iter().find(|(p, _)| p == port) {
                    findings.push(SecurityFinding {
                        container_id: c.id.clone(),
                        container_name: c.name.clone(),
                        rule_id: format!("SEC-PORT-{}", port),
                        title: format!("Puerto Sensible Expuesto Públicamente ({})", service),
                        description: format!(
                            "El puerto {} ({}) del contenedor '{}' está publicado en '{}', siendo accesible desde redes externas sin cortafuegos intermedio.",
                            port, service, c.name, host_ip
                        ),
                        severity: Severity::Critical,
                        remediation: format!(
                            "Vincula el puerto exclusivamente a la interfaz local de bucle invertido: '-p 127.0.0.1:{}:{}'.",
                            port, port
                        ),
                    });
                }
            }
        }

        // 5. Ausencia de Límites de Memoria (Riesgo de OOM)
        if c.memory_limit_bytes <= 0 {
            findings.push(SecurityFinding {
                container_id: c.id.clone(),
                container_name: c.name.clone(),
                rule_id: "SEC-OOM".to_string(),
                title: "Sin Límite de Memoria Asignado (Riesgo OOM)".to_string(),
                description: format!(
                    "El contenedor '{}' no tiene cuota máxima de memoria configurada. Una fuga de memoria (memory leak) puede congelar todo el servidor anfitrión.",
                    c.name
                ),
                severity: Severity::Warning,
                remediation: "Configura un límite de memoria estricto en el arranque: '--memory 512m' o 'deploy.resources.limits.memory' en Docker Compose.".to_string(),
            });
        }

        // 6. Sistema de Archivos Raíz Modificable en Contenedores Privilegiados
        if !c.read_only_rootfs && c.privileged {
            findings.push(SecurityFinding {
                container_id: c.id.clone(),
                container_name: c.name.clone(),
                rule_id: "SEC-ROOTFS".to_string(),
                title: "Rootfs Modificable en Contenedor Privilegiado".to_string(),
                description: format!(
                    "El contenedor privilegiado '{}' tiene el sistema de archivos raíz escribible, lo que facilita la persistencia de modificaciones.",
                    c.name
                ),
                severity: Severity::Warning,
                remediation: "Configura el contenedor con '--read-only' y asigna 'tmpfs' a las rutas efímeras como /tmp.".to_string(),
            });
        }
    }

    // Cálculo del Security Score (Puntuación de 0 a 100)
    let critical_count = findings.iter().filter(|f| f.severity == Severity::Critical).count();
    let warning_count = findings.iter().filter(|f| f.severity == Severity::Warning).count();
    let info_count = findings.iter().filter(|f| f.severity == Severity::Info).count();

    let penalty = (critical_count * 25) + (warning_count * 10) + (info_count * 5);
    let score = if penalty >= 100 { 0 } else { 100 - penalty as u32 };

    SentinelAuditReport {
        score,
        total_inspected: containers.len(),
        critical_count,
        warning_count,
        info_count,
        findings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sentinel_detects_openai_secret() {
        let container = ContainerSecurityContext {
            id: "c1".to_string(),
            name: "api-backend".to_string(),
            env_vars: vec![
                "NODE_ENV=production".to_string(),
                "OPENAI_API_KEY=sk-abcdef1234567890abcdef1234567890".to_string(),
            ],
            user: Some("app".to_string()),
            privileged: false,
            memory_limit_bytes: 536870912,
            exposed_ports: vec![(8080, "127.0.0.1".to_string())],
            read_only_rootfs: false,
        };

        let report = audit_containers(&[container]);
        assert_eq!(report.critical_count, 1);
        assert!(report.findings.iter().any(|f| f.rule_id == "SEC-002"));
    }

    #[test]
    fn test_sentinel_detects_privileged_and_oom() {
        let container = ContainerSecurityContext {
            id: "c2".to_string(),
            name: "system-helper".to_string(),
            env_vars: vec![],
            user: Some("root".to_string()),
            privileged: true,
            memory_limit_bytes: 0, // Sin límite
            exposed_ports: vec![],
            read_only_rootfs: false,
        };

        let report = audit_containers(&[container]);
        assert!(report.findings.iter().any(|f| f.rule_id == "SEC-PRIV"));
        assert!(report.findings.iter().any(|f| f.rule_id == "SEC-OOM"));
    }

    #[test]
    fn test_sentinel_detects_sensitive_port_exposure() {
        let container = ContainerSecurityContext {
            id: "c3".to_string(),
            name: "cache-redis".to_string(),
            env_vars: vec![],
            user: Some("redis".to_string()),
            privileged: false,
            memory_limit_bytes: 268435456,
            exposed_ports: vec![(6379, "0.0.0.0".to_string())],
            read_only_rootfs: true,
        };

        let report = audit_containers(&[container]);
        assert!(report.findings.iter().any(|f| f.rule_id == "SEC-PORT-6379"));
        assert_eq!(report.critical_count, 1);
    }
}
