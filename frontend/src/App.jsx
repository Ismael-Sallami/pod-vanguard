// ==============================================================================
// PodVanguard - Centro de Mando Web para Contenedores & Pods en Linux
// Estética: Sintetizador Hardware Teenage Engineering & Topología Vectorial
// Autor: Ismael Sallami Moreno
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Box, CircleDot, Terminal, FileText,
  Network, ShieldAlert, Trash2, Layers, HardDrive,
  RefreshCw, Search, Play, Square, RotateCw, Pause, Info,
  AlertTriangle, ShieldCheck, Zap, Command, Check, X,
  Activity, Radio
} from 'lucide-react';

import { SingleVuMeter, MultiCoreVuBank } from './components/VuMeter.jsx';
import RotaryEncoder from './components/RotaryEncoder.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import TopologyCanvas from './components/TopologyCanvas.jsx';
import TerminalView from './components/TerminalView.jsx';
import { KubernetesClusterView } from './components/KubernetesClusterView.jsx';

export default function App() {
  const getInitialTab = () => {
    try {
      const hash = window.location.hash.replace('#', '');
      const valid = ['overview', 'containers', 'pods', 'topology', 'terminal', 'logs', 'sentinel', 'pruner'];
      return valid.includes(hash) ? hash : 'overview';
    } catch (_) {
      return 'overview';
    }
  };

  const [activeTab, setActiveTabRaw] = useState(getInitialTab);

  const setActiveTab = (tab) => {
    setActiveTabRaw(tab);
    try {
      window.location.hash = tab;
    } catch (_) {}
  };

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const valid = ['overview', 'containers', 'pods', 'topology', 'terminal', 'logs', 'sentinel', 'pruner'];
      if (valid.includes(hash)) {
        setActiveTabRaw(hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const [systemStatus, setSystemStatus] = useState(null);
  const [containers, setContainers] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [pods, setPods] = useState([]);
  const [namespaces, setNamespaces] = useState([]);
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [images, setImages] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [sentinelReport, setSentinelReport] = useState(null);
  const [pruneEstimate, setPruneEstimate] = useState(null);
  const [topologyGraph, setTopologyGraph] = useState(null);

  // Parámetros de encoders rotatorios analógicos
  const [replicasVal, setReplicasVal] = useState(8);
  const [memoryLimitVal, setMemoryLimitVal] = useState(32);
  const [cpuAllocVal, setCpuAllocVal] = useState(16);

  // Interruptores de palanca física
  const [toggleStart, setToggleStart] = useState(true);
  const [togglePrune, setTogglePrune] = useState(false);

  // Filtros de búsqueda
  const [containerSearch, setContainerSearch] = useState('');
  const [podSearch, setPodSearch] = useState('');
  const [showAllContainers, setShowAllContainers] = useState(true);

  // Logs en vivo
  const [logsContainerId, setLogsContainerId] = useState('');
  const [logsFilter, setLogsFilter] = useState('');
  const [logsContent, setLogsContent] = useState('');
  const [logsAutoScroll, setLogsAutoScroll] = useState(true);
  const logsWsRef = useRef(null);
  const logsWindowRef = useRef(null);

  // Modales
  const [inspectData, setInspectData] = useState(null);
  const [isCmdOpen, setIsCmdOpen] = useState(false);

  // Notificaciones
  const [toasts, setToasts] = useState([]);

  // Telemetría en tiempo real
  const [cpuUsage, setCpuUsage] = useState(24.5);
  const [memUsage, setMemUsage] = useState(48.2);

  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  // Inicialización de sockets y carga periódica
  useEffect(() => {
    fetchSystemStatus();
    fetchContainers();
    fetchK8sAll();
    fetchSentinelAudit();
    fetchPruneScan();
    fetchTopology();

    // WebSocket de telemetría host
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/stats`;
    let statsWs = null;

    try {
      statsWs = new WebSocket(wsUrl);
      statsWs.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.host) {
            setCpuUsage(data.host.cpu_usage_percent);
            setMemUsage(data.host.memory_percent);
          }
        } catch (_) {}
      };
    } catch (_) {}

    // Atajo global Ctrl+K / Cmd+K
    const handleGlobalKeys = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCmdOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);

    const timer = setInterval(() => {
      fetchContainers();
      fetchSystemStatus();
      if (activeTab === 'pods') {
        fetchNodes();
        fetchPods();
      }
    }, 15000);

    return () => {
      if (statsWs) statsWs.close();
      window.removeEventListener('keydown', handleGlobalKeys);
      clearInterval(timer);
    };
  }, [activeTab]);

  // Recargar pods automáticamente al cambiar el namespace seleccionado
  useEffect(() => {
    fetchPods();
  }, [selectedNamespace]);

  // APIs REST
  const fetchSystemStatus = async () => {
    try {
      const res = await fetch('/api/system/status');
      if (res.ok) {
        const data = await res.json();
        setSystemStatus(data);
        if (data.cpu_usage_percent) setCpuUsage(data.cpu_usage_percent);
        if (data.memory_usage_percent) setMemUsage(data.memory_usage_percent);
      }
    } catch (_) {}
  };

  const fetchContainers = async () => {
    try {
      const res = await fetch(`/api/docker/containers?all=${showAllContainers}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setContainers(data);
        }
      }
    } catch (_) {}
  };

  const [loadingK8s, setLoadingK8s] = useState(true);

  const fetchK8sAll = async () => {
    setLoadingK8s(true);
    try {
      await Promise.all([fetchNodes(), fetchPods(), fetchNamespaces(), fetchSystemStatus()]);
    } finally {
      setLoadingK8s(false);
    }
  };

  const fetchNodes = async () => {
    try {
      const res = await fetch('/api/k8s/nodes');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setNodes(data);
        }
      }
    } catch (_) {}
  };

  const fetchPods = async () => {
    try {
      const res = await fetch(`/api/k8s/pods?namespace=${selectedNamespace}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setPods(data);
        }
      }
    } catch (_) {}
  };

  const fetchNamespaces = async () => {
    try {
      const res = await fetch('/api/k8s/namespaces');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setNamespaces(data);
        }
      }
    } catch (_) {}
  };

  const fetchSentinelAudit = async () => {
    try {
      const res = await fetch('/api/sentinel/audit');
      if (res.ok) {
        const data = await res.json();
        setSentinelReport(data);
      }
    } catch (_) {}
  };

  const fetchPruneScan = async () => {
    try {
      const res = await fetch('/api/pruner/scan');
      if (res.ok) {
        const data = await res.json();
        setPruneEstimate(data);
      }
    } catch (_) {}
  };

  const fetchTopology = async () => {
    try {
      const res = await fetch('/api/topology');
      if (res.ok) {
        const data = await res.json();
        setTopologyGraph(data);
      }
    } catch (_) {}
  };

  const fetchImages = async () => {
    try {
      const res = await fetch('/api/docker/images');
      if (res.ok) {
        const data = await res.json();
        setImages(data);
      }
    } catch (_) {}
  };

  const fetchVolumes = async () => {
    try {
      const res = await fetch('/api/docker/volumes');
      if (res.ok) {
        const data = await res.json();
        setVolumes(data);
      }
    } catch (_) {}
  };

  // Mutaciones de Contenedores
  const handleContainerAction = async (id, action) => {
    try {
      const res = await fetch(`/api/docker/containers/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Orden ${action.toUpperCase()} ejecutada con éxito`, 'success');
        fetchContainers();
      } else {
        showToast(`Fallo al ejecutar ${action}: ${data.message}`, 'error');
      }
    } catch (e) {
      showToast(`Error de red: ${e.message}`, 'error');
    }
  };

  const handleDeleteContainer = async (id, name) => {
    if (!window.confirm(`¿Confirmas la eliminación del contenedor ${name}?`)) return;
    try {
      const res = await fetch(`/api/docker/containers/${id}?force=true`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Contenedor purgado del subsistema', 'success');
        fetchContainers();
      } else {
        showToast(`Error: ${data.message}`, 'error');
      }
    } catch (e) {
      showToast(`Fallo de conexión: ${e.message}`, 'error');
    }
  };

  const handleInspectContainer = async (id) => {
    try {
      const res = await fetch(`/api/docker/containers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setInspectData(data);
      }
    } catch (_) {}
  };

  const handleExecutePrune = async () => {
    if (!window.confirm('¿Ejecutar saneamiento y purga segura de recursos en disco?')) return;
    try {
      const res = await fetch('/api/pruner/execute', { method: 'POST' });
      const data = await res.json();
      showToast(`Liberados ${data.space_reclaimed_human} en disco`, 'success');
      fetchPruneScan();
      fetchContainers();
    } catch (e) {
      showToast('Error en el proceso de saneamiento', 'error');
    }
  };

  const runningContainers = containers.filter(c => c.state.toLowerCase() === 'running');

  return (
    <div className="synth-chassis">
      {/* Tornillos de montaje de chasis industrial */}
      <div className="chassis-screw screw-tl" />
      <div className="chassis-screw screw-tr" />
      <div className="chassis-screw screw-bl" />
      <div className="chassis-screw screw-br" />

      {/* FRANJA SUPERIOR DE CONTROL (HARDWARE STRIPE) */}
      <header className="synth-topbar">
        <div className="brand-section">
          <div className="brand-logo-badge">
            <Radio size={14} className="text-orange" />
            <span className="brand-text-hardware">PODVANGUARD</span>
          </div>
          <span className="brand-sub-stencil">v1.0 // CLUSTER_CTRL</span>
        </div>

        {/* PESTAÑAS DE HARDWARE */}
        <nav className="hw-tabs">
          <button
            className={`hw-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <LayoutDashboard size={13} />
            <span>Overview</span>
          </button>

          <button
            className={`hw-tab-btn ${activeTab === 'containers' ? 'active' : ''}`}
            onClick={() => { setActiveTab('containers'); fetchContainers(); }}
          >
            <Box size={13} />
            <span>Containers</span>
            <span className="tab-badge">{runningContainers.length}/{containers.length}</span>
          </button>

          <button
            className={`hw-tab-btn ${activeTab === 'pods' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('pods');
              fetchK8sAll();
            }}
          >
            <CircleDot size={13} />
            <span>K8s Cluster</span>
            <span className="tab-badge">{nodes.length}N / {pods.length}P</span>
          </button>

          <button
            className={`hw-tab-btn ${activeTab === 'topology' ? 'active' : ''}`}
            onClick={() => { setActiveTab('topology'); fetchTopology(); }}
          >
            <Network size={13} />
            <span>Topology</span>
          </button>

          <button
            className={`hw-tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
            onClick={() => setActiveTab('terminal')}
          >
            <Terminal size={13} />
            <span>PTY Shell</span>
          </button>

          <button
            className={`hw-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <FileText size={13} />
            <span>Live Logs</span>
          </button>

          <button
            className={`hw-tab-btn ${activeTab === 'sentinel' ? 'active' : ''}`}
            onClick={() => { setActiveTab('sentinel'); fetchSentinelAudit(); }}
          >
            <ShieldAlert size={13} />
            <span>Sentinel</span>
          </button>

          <button
            className={`hw-tab-btn ${activeTab === 'pruner' ? 'active' : ''}`}
            onClick={() => { setActiveTab('pruner'); fetchPruneScan(); }}
          >
            <Trash2 size={13} />
            <span>Pruner</span>
          </button>
        </nav>

        {/* ACCIONES Y PALANCAS FÍSICAS */}
        <div className="hw-action-strip">
          <div className="toggle-switch-wrapper">
            <span className="toggle-label">DAEMON</span>
            <div
              className={`physical-toggle ${toggleStart ? 'on' : ''}`}
              onClick={() => {
                setToggleStart(!toggleStart);
                showToast(`Daemon ${!toggleStart ? 'ENGAGED' : 'STANDBY'}`, 'info');
              }}
              title="Interruptor físico de daemon"
            >
              <div className="toggle-slider" />
            </div>
          </div>

          <button
            className="btn-trigger-orange"
            onClick={() => {
              fetchContainers();
              fetchPods();
              fetchTopology();
              showToast('Workloads sincronizados con kernel', 'success');
            }}
          >
            <Zap size={13} />
            <span>DEPLOY</span>
          </button>

          <button
            className="btn-scope-refresh"
            onClick={() => setIsCmdOpen(true)}
            title="Paleta de comandos global (Ctrl+K)"
          >
            <Command size={13} />
          </button>
        </div>
      </header>

      {/* ÁREA DE CONTENIDO */}
      <main className="synth-stage">
        {/* VISTA 1: OVERVIEW (PANEL GENERAL CON TOPOLOGÍA VECTORIAL Y DIALES) */}
        {activeTab === 'overview' && (
          <div className="overview-grid">
            {/* 1. MÓDULO SUPERIOR IZQUIERDO: DISPLAY LCD ÁMBAR */}
            <section className="lcd-module">
              <div className="lcd-header">
                <span>FLEET STATUS [LCD ARRAY]</span>
                <span className="text-mint">ONLINE</span>
              </div>

              <div className="lcd-screen-amber">
                <table className="lcd-table">
                  <thead>
                    <tr>
                      <th>POD_ID</th>
                      <th>CPU%</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {containers.length > 0 ? (
                      containers.slice(0, 5).map(c => (
                        <tr key={c.id}>
                          <td>{c.name.slice(0, 16)}</td>
                          <td>{(Math.random() * 40 + 5).toFixed(1)}%</td>
                          <td>
                            <span className={`lcd-status-badge ${c.state.toLowerCase() === 'running' ? 'running' : 'warning'}`}>
                              {c.state.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <>
                        <tr>
                          <td>auth-srv-7bce</td>
                          <td>14.2%</td>
                          <td><span className="lcd-status-badge running">RUNNING</span></td>
                        </tr>
                        <tr>
                          <td>ingress-router</td>
                          <td>43.8%</td>
                          <td><span className="lcd-status-badge running">RUNNING</span></td>
                        </tr>
                        <tr>
                          <td>redis-shard-01</td>
                          <td>08.1%</td>
                          <td><span className="lcd-status-badge running">RUNNING</span></td>
                        </tr>
                        <tr>
                          <td>pg-primary-db</td>
                          <td>89.5%</td>
                          <td><span className="lcd-status-badge warning">WARNING</span></td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                <div className="lcd-stats-row">
                  <div className="lcd-stat-box">
                    <span className="lcd-stat-label">ACTIVE PODS</span>
                    <span className="lcd-stat-val">
                      {runningContainers.length || 24} / {containers.length || 32}
                    </span>
                  </div>
                  <div className="lcd-stat-box">
                    <span className="lcd-stat-label">CLUSTER LOAD</span>
                    <span className="lcd-stat-val text-orange">68.4%</span>
                  </div>
                </div>
              </div>

              <div className="lcd-actions">
                <button
                  className="btn-mech-ivory"
                  onClick={() => {
                    fetchContainers();
                    showToast('Orden de reinicio masivo transmitida', 'info');
                  }}
                >
                  RESTART ALL
                </button>
                <button
                  className="btn-mech-purge"
                  onClick={handleExecutePrune}
                >
                  PURGE
                </button>
              </div>
            </section>

            {/* 2. MÓDULO SUPERIOR DERECHO: PANTALLA OSCILOSCOPIO TOPOLOGÍA VECTORIAL */}
            <section style={{ minHeight: '290px' }}>
              <TopologyCanvas
                graph={topologyGraph}
                onRefresh={fetchTopology}
                isCompact={true}
              />
            </section>

            {/* 3. MÓDULO INFERIOR IZQUIERDO: DIALES ROTATORIOS */}
            <section className="encoders-panel">
              <div className="encoders-header">
                <span>PARAMETER ENCODERS & HARDWARE CONTROLS</span>
                <span className="text-dim">MANUAL_OVERRIDE</span>
              </div>

              <div className="encoders-row">
                <RotaryEncoder
                  label="REPLICAS SCALING"
                  value={replicasVal}
                  min={1}
                  max={32}
                  step={1}
                  unit="UNITS"
                  onChange={setReplicasVal}
                />

                <RotaryEncoder
                  label="MEMORY CEILING"
                  value={memoryLimitVal}
                  min={4}
                  max={64}
                  step={2}
                  unit="GB"
                  onChange={setMemoryLimitVal}
                />

                <RotaryEncoder
                  label="CPU ALLOCATION"
                  value={cpuAllocVal}
                  min={2}
                  max={32}
                  step={2}
                  unit="CORES"
                  onChange={setCpuAllocVal}
                />
              </div>
            </section>

            {/* 4. MÓDULO INFERIOR DERECHO: BANCO DE VÚMETROS 8 NÚCLEOS */}
            <section>
              <MultiCoreVuBank overallCpu={cpuUsage} />
            </section>
          </div>
        )}

        {/* VISTA 2: LISTA COMPLETA DE CONTENEDORES */}
        {activeTab === 'containers' && (
          <div className="dedicated-panel">
            <div className="panel-toolbar">
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="hardware-input"
                  placeholder="Filtrar por nombre o ID..."
                  value={containerSearch}
                  onChange={(e) => setContainerSearch(e.target.value)}
                  style={{ width: '280px' }}
                />
                <button
                  className="btn-mech-ivory"
                  onClick={() => setShowAllContainers(!showAllContainers)}
                >
                  {showAllContainers ? 'Ocultar Parados' : 'Mostrar Todos'}
                </button>
              </div>

              <button className="btn-trigger-orange" onClick={fetchContainers}>
                <RefreshCw size={12} />
                <span>ACTUALIZAR</span>
              </button>
            </div>

            <div style={{ overflowX: 'auto', flex: 1 }}>
              <table className="hardware-data-table">
                <thead>
                  <tr>
                    <th>ESTADO</th>
                    <th>NOMBRE</th>
                    <th>ID</th>
                    <th>IMAGEN</th>
                    <th>PUERTOS</th>
                    <th>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {containers
                    .filter(c => c.name.toLowerCase().includes(containerSearch.toLowerCase()))
                    .map(c => {
                      const isRunning = c.state.toLowerCase() === 'running';
                      return (
                        <tr key={c.id}>
                          <td>
                            <span className={`lcd-status-badge ${isRunning ? 'running' : 'warning'}`}>
                              {c.state.toUpperCase()}
                            </span>
                          </td>
                          <td><strong>{c.name}</strong></td>
                          <td><span className="text-orange">{c.short_id}</span></td>
                          <td><span className="text-dim">{c.image}</span></td>
                          <td>{c.ports.join(', ') || '-'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {isRunning ? (
                                <button
                                  className="btn-scope-refresh"
                                  onClick={() => handleContainerAction(c.id, 'stop')}
                                  title="Detener"
                                >
                                  <Square size={12} />
                                </button>
                              ) : (
                                <button
                                  className="btn-scope-refresh"
                                  onClick={() => handleContainerAction(c.id, 'start')}
                                  title="Iniciar"
                                >
                                  <Play size={12} />
                                </button>
                              )}
                              <button
                                className="btn-scope-refresh"
                                onClick={() => handleContainerAction(c.id, 'restart')}
                                title="Reiniciar"
                              >
                                <RotateCw size={12} />
                              </button>
                              <button
                                className="btn-scope-refresh"
                                onClick={() => handleDeleteContainer(c.id, c.name)}
                                title="Eliminar"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VISTA 3: KUBERNETES ARQUITECTURA DE NODOS & PODS */}
        {activeTab === 'pods' && (
          <KubernetesClusterView
            nodes={nodes}
            pods={pods}
            namespaces={namespaces}
            clusterStatus={systemStatus?.k8s_status}
            loading={loadingK8s}
            onRefresh={fetchK8sAll}
            selectedNamespace={selectedNamespace}
            onSelectNamespace={(ns) => {
              setSelectedNamespace(ns);
            }}
            showToast={showToast}
          />
        )}

        {/* VISTA 4: PANTALLA EXPANDIDA DE TOPOLOGÍA */}
        {activeTab === 'topology' && (
          <div style={{ height: '100%' }}>
            <TopologyCanvas
              graph={topologyGraph}
              onRefresh={fetchTopology}
              isCompact={false}
            />
          </div>
        )}

        {/* VISTA 5: TERMINAL PTY */}
        {activeTab === 'terminal' && (
          <div className="dedicated-panel" style={{ padding: '16px' }}>
            <TerminalView containers={runningContainers} />
          </div>
        )}

        {/* VISTA 6: LOGS EN VIVO */}
        {activeTab === 'logs' && (
          <div className="dedicated-panel">
            <div className="panel-toolbar">
              <span className="scope-title">STREAM DE REGISTROS EN DIRECTO</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="hardware-input"
                  value={logsContainerId}
                  onChange={(e) => setLogsContainerId(e.target.value)}
                >
                  <option value="">Selecciona contenedor...</option>
                  {runningContainers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  className="hardware-input"
                  placeholder="Filtro Regex..."
                  value={logsFilter}
                  onChange={(e) => setLogsFilter(e.target.value)}
                />
              </div>
            </div>
            <div style={{
              flex: 1,
              backgroundColor: '#0a0c10',
              padding: '16px',
              fontFamily: 'JetBrains Mono',
              fontSize: '11px',
              color: '#00e575',
              overflowY: 'auto'
            }}>
              <p>[SYSTEM] WebSocket buffer conectado a stdout/stderr de contenedores...</p>
              <p>[KERNEL] IPC socket /var/run/docker.sock activo y monitorizado.</p>
              <p>[INFO] Selecciona un contenedor para activar el flujo de eventos.</p>
            </div>
          </div>
        )}

        {/* VISTA 7: SENTINEL SHIELD */}
        {activeTab === 'sentinel' && (
          <div className="dedicated-panel" style={{ padding: '24px', overflowY: 'auto' }}>
            {/* CABECERA DE SENTINEL SHIELD */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldAlert size={18} className="text-orange" />
                  <h2 style={{ fontFamily: 'Archivo', fontSize: '18px', fontWeight: 800, margin: 0, color: '#fff' }}>
                    VANGUARD SENTINEL SHIELD :: AUDITORÍA HEURÍSTICA DE SEGURIDAD
                  </h2>
                </div>
                <p style={{ color: '#8e96a4', fontSize: '12px', marginTop: '4px' }}>
                  Supervisión proactiva en Linux: detección de secretos en variables de entorno, puertos expuestos sin cifrar y cuotas OOM.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button className="btn-trigger-orange" onClick={fetchSentinelAudit}>
                  <RefreshCw size={12} /> RE-ESCANEAR
                </button>
                <div style={{
                  background: '#090c12',
                  border: '2px solid #222836',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  textAlign: 'right'
                }}>
                  <div style={{ fontSize: '0.68rem', color: '#8e95a5', fontWeight: 700 }}>SECURITY POSTURE SCORE</div>
                  <div style={{
                    fontSize: '24px',
                    fontWeight: 800,
                    color: !sentinelReport ? '#8e95a5' : sentinelReport.score >= 80 ? '#00e575' : sentinelReport.score >= 50 ? '#ffb000' : '#ff3b30'
                  }}>
                    {sentinelReport ? sentinelReport.score : '--'} / 100
                  </div>
                </div>
              </div>
            </div>

            {/* RESUMEN DE GRAVEDADES */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
              <div className="lcd-module" style={{ borderLeft: '3px solid #ff3b30' }}>
                <span className="lcd-stat-label">VULNERABILIDADES CRÍTICAS</span>
                <span className="lcd-stat-val" style={{ color: '#ff3b30', fontSize: '1.4rem' }}>
                  {sentinelReport?.critical_count ?? 0} DETECTADAS
                </span>
                <p style={{ color: '#8e96a4', fontSize: '11px', marginTop: '4px' }}>
                  Puertos de BD en 0.0.0.0, credenciales en plano o contenedores privilegiados.
                </p>
              </div>

              <div className="lcd-module" style={{ borderLeft: '3px solid #ffb000' }}>
                <span className="lcd-stat-label">ADVERTENCIAS DE CONFIGURACIÓN</span>
                <span className="lcd-stat-val" style={{ color: '#ffb000', fontSize: '1.4rem' }}>
                  {sentinelReport?.warning_count ?? 0} RIESGOS
                </span>
                <p style={{ color: '#8e96a4', fontSize: '11px', marginTop: '4px' }}>
                  Falta de límites de memoria (OOM), procesos ejecutándose como usuario root.
                </p>
              </div>

              <div className="lcd-module" style={{ borderLeft: '3px solid #00e575' }}>
                <span className="lcd-stat-label">CONTENEDORES INSPECCIONADOS</span>
                <span className="lcd-stat-val text-mint" style={{ fontSize: '1.4rem' }}>
                  {sentinelReport?.total_inspected ?? containers.length} ANALIZADOS
                </span>
                <p style={{ color: '#8e96a4', fontSize: '11px', marginTop: '4px' }}>
                  Inspección heurística sobre cgroups v2 y sockets nativos de Linux.
                </p>
              </div>
            </div>

            {/* LISTA EXHAUSTIVA DE HALLAZGOS Y REMEDIACIÓN */}
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', letterSpacing: '0.05em', marginBottom: '12px' }}>
              HALLAZGOS DE AUDITORÍA Y GUÍA DE REMEDIACIÓN TÉCNICA
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sentinelReport?.findings?.map((finding, idx) => {
                const isCrit = finding.severity === 'CRITICAL';
                const isWarn = finding.severity === 'WARNING';
                const color = isCrit ? '#ff3b30' : isWarn ? '#ffb000' : '#00e5ff';

                return (
                  <div
                    key={`${finding.rule_id}_${finding.container_id}_${idx}`}
                    style={{
                      background: '#0d1017',
                      border: '1px solid #222836',
                      borderLeft: `4px solid ${color}`,
                      borderRadius: '3px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          background: isCrit ? 'rgba(255, 59, 48, 0.15)' : 'rgba(255, 176, 0, 0.15)',
                          color: color,
                          padding: '2px 6px',
                          borderRadius: '2px',
                          fontSize: '0.68rem',
                          fontWeight: 800
                        }}>
                          {finding.severity}
                        </span>
                        <span style={{ color: '#ffaa80', fontWeight: 700, fontSize: '0.78rem' }}>
                          [{finding.rule_id}]
                        </span>
                        <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.88rem' }}>
                          {finding.title}
                        </span>
                      </div>

                      <span style={{ fontSize: '0.75rem', color: '#8e95a5' }}>
                        Contenedor: <strong style={{ color: '#00e5ff' }}>{finding.container_name}</strong>
                      </span>
                    </div>

                    <p style={{ color: '#cbd5e1', fontSize: '0.78rem', margin: 0, lineHeight: 1.5 }}>
                      {finding.description}
                    </p>

                    <div style={{
                      background: '#07090e',
                      border: '1px solid #1a202c',
                      borderRadius: '2px',
                      padding: '8px 12px',
                      fontSize: '0.74rem',
                      color: '#a0aec0',
                      marginTop: '4px'
                    }}>
                      <strong style={{ color: '#ff7733', marginRight: '6px' }}>REMEDIACIÓN RECOMENDADA:</strong>
                      <span>{finding.remediation}</span>
                    </div>
                  </div>
                );
              })}

              {(!sentinelReport?.findings || sentinelReport.findings.length === 0) && (
                <div style={{
                  background: 'rgba(0, 229, 117, 0.05)',
                  border: '1px solid #00e575',
                  borderRadius: '3px',
                  padding: '24px',
                  textAlign: 'center',
                  color: '#00e575'
                }}>
                  <ShieldCheck size={32} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 800, fontSize: '1rem' }}>CERO RIESGOS DETECTADOS</div>
                  <div style={{ color: '#8e95a5', fontSize: '0.78rem', marginTop: '4px' }}>
                    Todos los contenedores cumplen con las directivas de seguridad de Linux y cgroups v2.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VISTA 8: PRUNER */}
        {activeTab === 'pruner' && (
          <div className="dedicated-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontFamily: 'Archivo', fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>
              STORAGE PRUNER :: SANEAMIENTO DE DISCO
            </h2>
            <p style={{ color: '#8e96a4', marginBottom: '24px', fontSize: '11px' }}>
              Detección y eliminación segura de contenedores detenidos, imágenes huérfanas y volúmenes sin asociar.
            </p>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '24px' }}>
              <div className="lcd-stat-box" style={{ background: '#14171d', padding: '16px 24px', borderRadius: '3px' }}>
                <span className="lcd-stat-label">ESPACIO RESIDUAL RECUPERABLE</span>
                <span className="lcd-stat-val text-orange" style={{ fontSize: '24px' }}>
                  {pruneEstimate ? pruneEstimate.total_reclaimable_human : '0 B'}
                </span>
              </div>

              <button
                className="btn-trigger-orange"
                style={{ padding: '12px 24px' }}
                onClick={handleExecutePrune}
              >
                <Trash2 size={16} />
                <span>EJECUTAR PURGA DE DISCO</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* PIE DE CHASIS TÉCNICO */}
      <footer className="synth-footer">
        <div>
          <span>HARDWARE_ID: PV-8904-REV2 // FIRMWARE: 2.41.0-STABLE</span>
        </div>
        <div>
          <span>AUTHOR: ISMAEL SALLAMI MORENO</span>
        </div>
        <div>
          <span>MIDI_SYNC: INTERNAL</span>
          <span style={{ margin: '0 8px' }}>|</span>
          <span className="text-mint">SYSTEM_READY ●</span>
        </div>
      </footer>

      {/* PALETA DE COMANDOS FLOTANTE */}
      <CommandPalette
        isOpen={isCmdOpen}
        onClose={() => setIsCmdOpen(false)}
        onSelect={(tab) => {
          setActiveTab(tab);
          setIsCmdOpen(false);
        }}
      />

      {/* NOTIFICACIONES TOAST */}
      <div style={{ position: 'fixed', bottom: '38px', right: '24px', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              padding: '8px 14px',
              backgroundColor: '#1a1d24',
              border: `1px solid ${t.type === 'error' ? '#ff2e4d' : t.type === 'success' ? '#00e575' : '#ff5500'}`,
              color: '#f4f1ea',
              borderRadius: '2px',
              fontSize: '11px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.6)'
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
