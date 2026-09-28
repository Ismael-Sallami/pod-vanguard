import React, { useState, useMemo } from 'react';
import {
  Server,
  Layers,
  CircleDot,
  RefreshCw,
  Search,
  Activity,
  Cpu,
  HardDrive,
  CheckCircle,
  AlertTriangle,
  Radio,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink
} from 'lucide-react';

/**
 * Componente de Inspección Arquitectónica de Nodos y Pods de Kubernetes.
 * Implementa la estética Teenage Engineering / Hardware Synth brutalista:
 * - Tarjetas de nodo con indicadores LED de telemetría y presión de recursos
 * - Medidores de pods asignados vs capacidad física
 * - Explorador y buscador de Pods por Namespace
 * - Visor integrado de registros (logs) del Pod seleccionado
 */
export function KubernetesClusterView({
  nodes = [],
  pods = [],
  namespaces = [],
  clusterStatus = null,
  loading = false,
  onRefresh,
  selectedNamespace,
  onSelectNamespace,
  showToast,
}) {
  const [activeSubTab, setActiveSubTab] = useState('nodes'); // 'nodes' | 'pods' | 'namespaces'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNode, setExpandedNode] = useState(null);
  const [selectedPodForLogs, setSelectedPodForLogs] = useState(null);
  const [podLogs, setPodLogs] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  // Nodos de arquitectura multi-nodo para exploración y demostración de alta fidelidad
  const demoNodes = useMemo(() => [
    {
      name: 'pv-control-plane-01',
      status: 'Ready',
      roles: ['control-plane', 'master'],
      internal_ip: '10.240.0.10',
      hostname: 'k8s-master-01',
      os_image: 'Ubuntu 24.04.4 LTS',
      kernel_version: '6.17.0-23-generic',
      container_runtime: 'containerd://2.2.3-k3s1',
      kubelet_version: 'v1.35.4+k3s1',
      architecture: 'linux/amd64',
      cpu_capacity: '8',
      memory_capacity: '32.0 GB',
      pods_capacity: 110,
      allocated_pods_count: 24,
      pod_cidr: '10.244.0.0/24',
      conditions: [
        { condition_type: 'MemoryPressure', status: 'False', reason: 'KubeletHasSufficientMemory', message: 'Sufficient memory available' },
        { condition_type: 'DiskPressure', status: 'False', reason: 'KubeletHasNoDiskPressure', message: 'No disk pressure' },
        { condition_type: 'PIDPressure', status: 'False', reason: 'KubeletHasSufficientPID', message: 'Sufficient PID available' },
        { condition_type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }
      ]
    },
    {
      name: 'pv-worker-alpha-02',
      status: 'Ready',
      roles: ['worker'],
      internal_ip: '10.240.0.11',
      hostname: 'k8s-worker-02',
      os_image: 'Ubuntu 24.04.4 LTS',
      kernel_version: '6.17.0-23-generic',
      container_runtime: 'containerd://2.2.3-k3s1',
      kubelet_version: 'v1.35.4+k3s1',
      architecture: 'linux/amd64',
      cpu_capacity: '16',
      memory_capacity: '64.0 GB',
      pods_capacity: 110,
      allocated_pods_count: 68,
      pod_cidr: '10.244.1.0/24',
      conditions: [
        { condition_type: 'MemoryPressure', status: 'False', reason: 'KubeletHasSufficientMemory', message: 'Sufficient memory available' },
        { condition_type: 'DiskPressure', status: 'False', reason: 'KubeletHasNoDiskPressure', message: 'No disk pressure' },
        { condition_type: 'PIDPressure', status: 'False', reason: 'KubeletHasSufficientPID', message: 'Sufficient PID available' },
        { condition_type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }
      ]
    },
    {
      name: 'pv-worker-gpu-03',
      status: 'Ready',
      roles: ['worker', 'accelerator'],
      internal_ip: '10.240.0.12',
      hostname: 'k8s-worker-03',
      os_image: 'Ubuntu 24.04.4 LTS',
      kernel_version: '6.17.0-23-generic',
      container_runtime: 'containerd://2.2.3-k3s1',
      kubelet_version: 'v1.35.4+k3s1',
      architecture: 'linux/amd64',
      cpu_capacity: '16',
      memory_capacity: '64.0 GB',
      pods_capacity: 110,
      allocated_pods_count: 42,
      pod_cidr: '10.244.2.0/24',
      conditions: [
        { condition_type: 'MemoryPressure', status: 'False', reason: 'KubeletHasSufficientMemory', message: 'Sufficient memory available' },
        { condition_type: 'DiskPressure', status: 'False', reason: 'KubeletHasNoDiskPressure', message: 'No disk pressure' },
        { condition_type: 'PIDPressure', status: 'False', reason: 'KubeletHasSufficientPID', message: 'Sufficient PID available' },
        { condition_type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }
      ]
    }
  ], []);

  // Nodos efectivos para renderizado: reales o simulación de alta fidelidad
  const effectiveNodes = useMemo(() => {
    if (demoMode) return demoNodes;
    if (nodes && nodes.length > 0) return nodes;
    return [];
  }, [demoMode, demoNodes, nodes]);

  // Filtrado reactivo de pods según búsqueda y namespace seleccionado
  const filteredPods = useMemo(() => {
    if (!Array.isArray(pods)) return [];
    return pods.filter(pod => {
      const name = String(pod.name || '').toLowerCase();
      const ns = String(pod.namespace || '').toLowerCase();
      const node = String(pod.node || '').toLowerCase();
      const query = searchQuery.toLowerCase().trim();

      const matchesSearch = !query || name.includes(query) || ns.includes(query) || node.includes(query);
      const matchesNamespace = selectedNamespace === 'all' || !selectedNamespace || pod.namespace === selectedNamespace;

      return matchesSearch && matchesNamespace;
    });
  }, [pods, searchQuery, selectedNamespace]);

  // Carga de logs para un pod específico
  const viewPodLogs = async (pod) => {
    setSelectedPodForLogs(pod);
    setLoadingLogs(true);
    setPodLogs('Cargando registros desde el control plane de Kubernetes...');
    try {
      const res = await fetch(`/api/k8s/pods/${encodeURIComponent(pod.namespace)}/${encodeURIComponent(pod.name)}/logs?tail=150`);
      if (res.ok) {
        const text = await res.text();
        setPodLogs(text || 'No hay salidas de registro emitidas por este Pod.');
      } else {
        setPodLogs(`Error obteniendo logs del pod (${res.status}): ${await res.text()}`);
      }
    } catch (err) {
      setPodLogs(`Excepción de red al conectar con el servidor: ${err.message}`);
    } finally {
      setLoadingLogs(false);
    }
  };

  const isConnected = clusterStatus?.connected || effectiveNodes.length > 0;

  return (
    <div className="dedicated-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* BARRA SUPERIOR DE TELEMETRÍA DEL CLÚSTER */}
      <div className="panel-toolbar" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Server size={16} className="text-orange" />
            <span className="scope-title" style={{ margin: 0 }}>
              KUBERNETES // {clusterStatus?.current_context || clusterStatus?.cluster_name || 'LOCAL-CLUSTER'}
            </span>
          </div>

          <span className={`lcd-status-badge ${isConnected ? 'running' : 'warning'}`}>
            {isConnected ? 'CLUSTER ONLINE' : 'CLUSTER OFFLINE'}
          </span>
        </div>

        {/* NAVEGACIÓN ENTRE SUB-MÓDULOS DE K8S */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: '#0a0d14', padding: '3px', borderRadius: '3px', border: '1px solid #222836' }}>
            <button
              onClick={() => setActiveSubTab('nodes')}
              style={{
                background: activeSubTab === 'nodes' ? '#ff5500' : 'transparent',
                color: activeSubTab === 'nodes' ? '#000' : '#8e95a5',
                border: 'none',
                padding: '5px 12px',
                fontSize: '0.74rem',
                fontWeight: 800,
                borderRadius: '2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Layers size={12} />
              <span>NODOS ({effectiveNodes.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('pods')}
              style={{
                background: activeSubTab === 'pods' ? '#ff5500' : 'transparent',
                color: activeSubTab === 'pods' ? '#000' : '#8e95a5',
                border: 'none',
                padding: '5px 12px',
                fontSize: '0.74rem',
                fontWeight: 800,
                borderRadius: '2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <CircleDot size={12} />
              <span>PODS ({pods.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('namespaces')}
              style={{
                background: activeSubTab === 'namespaces' ? '#ff5500' : 'transparent',
                color: activeSubTab === 'namespaces' ? '#000' : '#8e95a5',
                border: 'none',
                padding: '5px 12px',
                fontSize: '0.74rem',
                fontWeight: 800,
                borderRadius: '2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Radio size={12} />
              <span>NAMESPACES ({namespaces.length})</span>
            </button>
          </div>

          <button
            onClick={() => setDemoMode(!demoMode)}
            style={{
              background: demoMode ? 'rgba(0, 229, 255, 0.15)' : '#0d1017',
              color: demoMode ? '#00e5ff' : '#8e95a5',
              border: `1px solid ${demoMode ? '#00e5ff' : '#222836'}`,
              padding: '5px 10px',
              fontSize: '0.72rem',
              fontWeight: 800,
              borderRadius: '2px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Alternar entre clúster detectado y simulación de arquitectura multi-nodo de alta densidad"
          >
            <Radio size={11} />
            <span>{demoMode ? 'MODO DEMO (3 NODOS)' : 'SIMULAR MULTI-NODO'}</span>
          </button>

          <button className="btn-trigger-orange" onClick={onRefresh} title="Refrescar telemetría del clúster">
            <RefreshCw size={12} />
            <span>REFRESCAR</span>
          </button>
        </div>
      </div>

      {/* INDICADOR DE CARGA / SINCRONIZACIÓN DE TELEMETRÍA */}
      {loading && (
        <div style={{
          background: '#0d1017',
          border: '1px solid #ff5500',
          borderRadius: '4px',
          padding: '24px',
          textAlign: 'center',
          color: '#ffaa80',
          fontFamily: "'JetBrains Mono', monospace"
        }}>
          <Activity size={24} style={{ margin: '0 auto 8px', color: '#ff5500' }} />
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>
            SINCRONIZANDO ARQUITECTURA DE NODOS & PODS CON KUBERNETES...
          </div>
          <div style={{ fontSize: '0.74rem', color: '#8e95a5', marginTop: '4px' }}>
            Consultando estado del API Server, kubelet daemons y especificaciones JSON
          </div>
        </div>
      )}

      {/* SI EL CLÚSTER NO ESTÁ CONECTADO */}
      {!isConnected && !loading && (
        <div style={{
          background: '#0d1017',
          border: '1px dashed #ffb000',
          borderRadius: '4px',
          padding: '32px 24px',
          textAlign: 'center',
          color: '#8e95a5',
          fontFamily: "'JetBrains Mono', monospace"
        }}>
          <AlertTriangle size={32} color="#ffb000" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 8px' }}>
            No se detectó un clúster Kubernetes activo
          </h3>
          <p style={{ fontSize: '0.82rem', maxWidth: '600px', margin: '0 auto 16px', lineHeight: 1.6 }}>
            PodVanguard verificó el archivo <code>~/.kube/config</code> pero no fue posible comunicarse con el API Server. Si utilizas Minikube, K3s o Kind, asegúrate de haber arrancado el servicio en tu máquina Linux:
          </p>
          <div style={{
            background: '#07090e',
            display: 'inline-block',
            padding: '8px 16px',
            borderRadius: '3px',
            border: '1px solid #222836',
            color: '#00e5ff',
            fontSize: '0.8rem',
            marginBottom: '16px'
          }}>
            $ minikube start &nbsp;&nbsp;|&nbsp;&nbsp; $ sudo systemctl start k3s
          </div>
          <div>
            <button className="btn-trigger-orange" onClick={onRefresh}>
              <RefreshCw size={12} /> REINTENTAR DETECCIÓN
            </button>
          </div>
        </div>
      )}

      {/* SUB-VISTA 1: ARQUITECTURA DETALLADA DE NODOS */}
      {isConnected && activeSubTab === 'nodes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Tarjetas de Nodos de Kubernetes */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: '16px'
          }}>
            {effectiveNodes.map(node => {
              const isReady = node.status === 'Ready';
              const podPercent = Math.min(
                100,
                Math.round(((node.allocated_pods_count || 0) / (node.pods_capacity || 110)) * 100)
              );
              const isExpanded = expandedNode === node.name;
              const nodePods = pods.filter(p => p.node === node.name || p.node === node.hostname);

              return (
                <div
                  key={node.name}
                  style={{
                    background: '#0d1017',
                    border: '2px solid #222836',
                    borderRadius: '4px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    boxShadow: '4px 4px 0px #000'
                  }}
                >
                  {/* Encabezado del Nodo */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: isReady ? '#00e575' : '#ff3b30',
                          boxShadow: isReady ? '0 0 8px #00e575' : 'none'
                        }} />
                        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
                          {node.name}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#8e95a5' }}>
                        IP: {node.internal_ip} &nbsp;·&nbsp; CIDR: {node.pod_cidr}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      {node.roles?.map(role => (
                        <span
                          key={role}
                          style={{
                            background: role.includes('control') || role.includes('master') ? 'rgba(255, 85, 0, 0.15)' : 'rgba(0, 229, 255, 0.15)',
                            color: role.includes('control') || role.includes('master') ? '#ff7733' : '#00e5ff',
                            padding: '2px 6px',
                            borderRadius: '2px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            letterSpacing: '0.05em'
                          }}
                        >
                          {role.toUpperCase()}
                        </span>
                      ))}
                      <span className={`lcd-status-badge ${isReady ? 'running' : 'warning'}`}>
                        {node.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Vúmetro de Pods Asignados */}
                  <div style={{
                    background: '#07090e',
                    padding: '10px 12px',
                    borderRadius: '3px',
                    border: '1px solid #1a202c'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '6px' }}>
                      <span style={{ color: '#8e95a5' }}>CAPACIDAD DE PODS</span>
                      <span style={{ fontWeight: 700, color: podPercent > 90 ? '#ff3b30' : podPercent > 70 ? '#ffb000' : '#00e575' }}>
                        {node.allocated_pods_count} / {node.pods_capacity} ({podPercent}%)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#131822', borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${podPercent}%`,
                          background: podPercent > 90 ? '#ff3b30' : podPercent > 70 ? '#ffb000' : 'var(--pv-accent, #ff5500)',
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>
                  </div>

                  {/* Hardware & Capacidad Física */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '10px',
                    fontSize: '0.75rem'
                  }}>
                    <div style={{ background: '#090c12', padding: '8px 10px', borderRadius: '3px', border: '1px solid #1e2430' }}>
                      <div style={{ color: '#8e95a5', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                        <Cpu size={12} color="#ffaa80" /> NÚCLEOS CPU
                      </div>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
                        {node.cpu_capacity} Cores
                      </div>
                    </div>

                    <div style={{ background: '#090c12', padding: '8px 10px', borderRadius: '3px', border: '1px solid #1e2430' }}>
                      <div style={{ color: '#8e95a5', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                        <HardDrive size={12} color="#00e5ff" /> MEMORIA RAM
                      </div>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
                        {node.memory_capacity}
                      </div>
                    </div>
                  </div>

                  {/* Datos del Kernel y Runtime */}
                  <div style={{
                    fontSize: '0.72rem',
                    color: '#8e95a5',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    background: '#090c12',
                    padding: '8px 10px',
                    borderRadius: '3px',
                    border: '1px solid #1e2430'
                  }}>
                    <div><strong>OS / Kernel:</strong> {node.os_image} ({node.kernel_version})</div>
                    <div><strong>Runtime:</strong> <span style={{ color: '#00e5ff' }}>{node.container_runtime}</span></div>
                    <div><strong>Kubelet:</strong> <span style={{ color: '#ffb000' }}>{node.kubelet_version}</span> ({node.architecture})</div>
                  </div>

                  {/* Condiciones del Kubelet (Presión de Recursos) */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {node.conditions?.map(cond => {
                      const isNormal = (cond.condition_type === 'Ready' && cond.status === 'True') ||
                        (cond.condition_type !== 'Ready' && cond.status === 'False');
                      return (
                        <div
                          key={cond.condition_type}
                          title={cond.message || cond.reason}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: isNormal ? 'rgba(0, 229, 117, 0.08)' : 'rgba(255, 59, 48, 0.12)',
                            color: isNormal ? '#00e575' : '#ff3b30',
                            padding: '3px 7px',
                            borderRadius: '2px',
                            fontSize: '0.68rem',
                            fontWeight: 700
                          }}
                        >
                          {isNormal ? <CheckCircle size={10} /> : <AlertTriangle size={10} />}
                          <span>{cond.condition_type}: {cond.status === 'True' ? 'ACTIVO' : 'NORMAL'}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Botón desplegable para ver los pods que corren en este nodo */}
                  <button
                    onClick={() => setExpandedNode(isExpanded ? null : node.name)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #222836',
                      color: '#ff5500',
                      padding: '8px',
                      borderRadius: '3px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{isExpanded ? 'OCULTAR PODS DE ESTE NODO' : `VER PODS ASIGNADOS (${nodePods.length})`}</span>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {/* Lista desplegable de pods alojados en este nodo */}
                  {isExpanded && (
                    <div style={{
                      background: '#07090e',
                      border: '1px solid #1e2430',
                      borderRadius: '3px',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      padding: '6px'
                    }}>
                      {nodePods.map(pod => (
                        <div
                          key={pod.name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '5px 8px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            fontSize: '0.72rem'
                          }}
                        >
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                            <span style={{ color: '#ff7733', marginRight: '6px' }}>[{pod.namespace}]</span>
                            <span style={{ color: '#fff', fontWeight: 600 }}>{pod.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              color: (pod.status || pod.phase) === 'Running' ? '#00e575' : '#ffb000',
                              fontSize: '0.68rem',
                              fontWeight: 700
                            }}>
                              {pod.status || pod.phase || 'Unknown'}
                            </span>
                            <button
                              onClick={() => viewPodLogs(pod)}
                              style={{
                                background: '#161c28',
                                border: 'none',
                                color: '#00e5ff',
                                padding: '2px 5px',
                                borderRadius: '2px',
                                cursor: 'pointer',
                                fontSize: '0.65rem'
                              }}
                              title="Ver registros"
                            >
                              LOGS
                            </button>
                          </div>
                        </div>
                      ))}
                      {nodePods.length === 0 && (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#545b6b', fontSize: '0.72rem' }}>
                          No hay pods activos asignados a este nodo.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-VISTA 2: PODS & CARGAS DE TRABAJO */}
      {isConnected && activeSubTab === 'pods' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
          {/* Controles de búsqueda y namespace */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                className="hardware-input"
                style={{ width: '100%', paddingLeft: '32px' }}
                placeholder="Buscar pods por nombre, namespace o nodo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="hardware-input"
              value={selectedNamespace}
              onChange={(e) => onSelectNamespace(e.target.value)}
              style={{ minWidth: '180px' }}
            >
              <option value="all">Todos los Namespaces</option>
              {namespaces.map(ns => (
                <option key={ns.name} value={ns.name}>{ns.name}</option>
              ))}
            </select>
          </div>

          {/* Tabla de Pods */}
          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table className="hardware-data-table">
              <thead>
                <tr>
                  <th>NAMESPACE</th>
                  <th>NOMBRE DEL POD</th>
                  <th>ESTADO</th>
                  <th>CONTENEDORES</th>
                  <th>REINICIOS</th>
                  <th>IP POD</th>
                  <th>NODO ASIGNADO</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filteredPods.map(pod => {
                  const statusRaw = pod.status || pod.phase || 'Unknown';
                  const statusStr = String(statusRaw);
                  const isRunning = statusStr.toLowerCase() === 'running';
                  const isSuccess = statusStr.toLowerCase() === 'succeeded' || statusStr.toLowerCase() === 'completed';

                  return (
                    <tr key={`${pod.namespace}_${pod.name}`}>
                      <td><span className="text-orange">{pod.namespace}</span></td>
                      <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <strong title={pod.name}>{pod.name}</strong>
                      </td>
                      <td>
                        <span className={`lcd-status-badge ${isRunning || isSuccess ? 'running' : 'warning'}`}>
                          {statusStr.toUpperCase()}
                        </span>
                      </td>
                      <td>{pod.ready_containers || pod.ready || '-'}</td>
                      <td>
                        <span style={{ color: pod.restarts > 5 ? '#ff3b30' : pod.restarts > 0 ? '#ffb000' : '#8e95a5' }}>
                          {pod.restarts ?? 0}
                        </span>
                      </td>
                      <td><span className="text-dim">{pod.ip || '-'}</span></td>
                      <td><span className="text-dim">{pod.node || '-'}</span></td>
                      <td>
                        <button
                          className="btn-action-neutral"
                          onClick={() => viewPodLogs(pod)}
                          style={{ padding: '3px 8px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <FileText size={11} /> LOGS
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredPods.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: '#545b6b' }}>
                      No se encontraron Pods que coincidan con el filtro actual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-VISTA 3: NAMESPACES */}
      {isConnected && activeSubTab === 'namespaces' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '12px'
        }}>
          {namespaces.map(ns => {
            const nsPods = pods.filter(p => p.namespace === ns.name);
            const runningNsPods = nsPods.filter(p => (p.status || p.phase) === 'Running');

            return (
              <div
                key={ns.name}
                style={{
                  background: '#0d1017',
                  border: '1px solid #222836',
                  borderRadius: '3px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, color: '#fff', fontSize: '0.88rem' }}>{ns.name}</span>
                  <span className={`lcd-status-badge ${ns.status === 'Active' ? 'running' : 'warning'}`}>
                    {ns.status || 'ACTIVE'}
                  </span>
                </div>
                <div style={{ fontSize: '0.74rem', color: '#8e95a5' }}>
                  Pods Activos: <strong style={{ color: '#00e575' }}>{runningNsPods.length}</strong> / {nsPods.length}
                </div>
                <button
                  onClick={() => {
                    onSelectNamespace(ns.name);
                    setActiveSubTab('pods');
                  }}
                  style={{
                    background: '#161c28',
                    border: '1px solid #222836',
                    color: '#ff5500',
                    padding: '6px',
                    borderRadius: '2px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginTop: '4px'
                  }}
                >
                  VER PODS EN ESTE NAMESPACE →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE LOGS DE POD */}
      {selectedPodForLogs && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#0c0f16',
            border: '2px solid #ff5500',
            borderRadius: '4px',
            boxShadow: '8px 8px 0px #000',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Cabecera del modal */}
            <div style={{
              padding: '12px 16px',
              background: '#121622',
              borderBottom: '1px solid #222836',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: '#ff7733', fontWeight: 700, letterSpacing: '0.05em' }}>
                  REGISTROS DE KUBERNETES // [{selectedPodForLogs.namespace}]
                </span>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff' }}>
                  {selectedPodForLogs.name}
                </div>
              </div>
              <button
                onClick={() => setSelectedPodForLogs(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#8e95a5',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Cuerpo de logs */}
            <pre style={{
              flex: 1,
              margin: 0,
              padding: '16px',
              background: '#07090e',
              color: '#00e5ff',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.78rem',
              lineHeight: 1.5,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>
              {podLogs}
            </pre>

            {/* Pie del modal */}
            <div style={{
              padding: '10px 16px',
              background: '#0a0d14',
              borderTop: '1px solid #222836',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px'
            }}>
              <button
                className="btn-trigger-orange"
                onClick={() => viewPodLogs(selectedPodForLogs)}
                disabled={loadingLogs}
              >
                <RefreshCw size={12} /> REFRESCAR
              </button>
              <button
                className="btn-action-neutral"
                onClick={() => setSelectedPodForLogs(null)}
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
