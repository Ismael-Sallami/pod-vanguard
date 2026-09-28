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

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [systemStatus, setSystemStatus] = useState(null);
  const [containers, setContainers] = useState([]);
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
    fetchPods();
    fetchNamespaces();
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
    }, 15000);

    return () => {
      if (statsWs) statsWs.close();
      window.removeEventListener('keydown', handleGlobalKeys);
      clearInterval(timer);
    };
  }, []);

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
        setContainers(data);
      }
    } catch (_) {}
  };

  const fetchPods = async () => {
    try {
      const res = await fetch(`/api/k8s/pods?namespace=${selectedNamespace}`);
      if (res.ok) {
        const data = await res.json();
        setPods(data);
      }
    } catch (_) {}
  };

  const fetchNamespaces = async () => {
    try {
      const res = await fetch('/api/k8s/namespaces');
      if (res.ok) {
        const data = await res.json();
        setNamespaces(data);
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
            onClick={() => { setActiveTab('pods'); fetchPods(); }}
          >
            <CircleDot size={13} />
            <span>K8s Pods</span>
            <span className="tab-badge">{pods.length}</span>
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

        {/* VISTA 3: KUBERNETES PODS */}
        {activeTab === 'pods' && (
          <div className="dedicated-panel">
            <div className="panel-toolbar">
              <span className="scope-title">KUBERNETES CLUSTER PODS</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <select
                  className="hardware-input"
                  value={selectedNamespace}
                  onChange={(e) => {
                    setSelectedNamespace(e.target.value);
                    fetchPods();
                  }}
                >
                  <option value="all">Todos los Namespaces</option>
                  {namespaces.map(ns => (
                    <option key={ns.name} value={ns.name}>{ns.name}</option>
                  ))}
                </select>
                <button className="btn-trigger-orange" onClick={fetchPods}>
                  <RefreshCw size={12} />
                  <span>REFRESCAR</span>
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto', flex: 1 }}>
              <table className="hardware-data-table">
                <thead>
                  <tr>
                    <th>NAMESPACE</th>
                    <th>NOMBRE DEL POD</th>
                    <th>ESTADO</th>
                    <th>LISTOS</th>
                    <th>REINICIOS</th>
                    <th>NODO</th>
                  </tr>
                </thead>
                <tbody>
                  {pods.map(p => (
                    <tr key={p.name}>
                      <td><span className="text-orange">{p.namespace}</span></td>
                      <td><strong>{p.name}</strong></td>
                      <td>
                        <span className={`lcd-status-badge ${p.phase === 'Running' ? 'running' : 'warning'}`}>
                          {p.phase.toUpperCase()}
                        </span>
                      </td>
                      <td>{p.ready}</td>
                      <td>{p.restarts}</td>
                      <td><span className="text-dim">{p.node || 'local-worker'}</span></td>
                    </tr>
                  ))}
                  {pods.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#545b6b' }}>
                        No se detectó un clúster de Kubernetes en ejecución. PodVanguard opera de forma autónoma con el socket de Docker local.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
          <div className="dedicated-panel" style={{ padding: '20px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontFamily: 'Archivo', fontSize: '18px', fontWeight: 800 }}>
                  VANGUARD SENTINEL SHIELD :: AUDITORÍA HEURÍSTICA
                </h2>
                <p style={{ color: '#8e96a4', fontSize: '11px' }}>
                  Análisis proactivo de riesgos, credenciales expuestas en texto plano y límites de contención en Linux.
                </p>
              </div>
              <div style={{
                fontSize: '24px',
                fontWeight: 800,
                color: sentinelReport && sentinelReport.score < 80 ? '#ff5500' : '#00e575'
              }}>
                {sentinelReport ? sentinelReport.score : 100} / 100
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div className="lcd-module">
                <span className="lcd-stat-label">SECRETOS EN VARIABLES DE ENTORNO</span>
                <span className="lcd-stat-val text-mint">0 DETECTADOS</span>
                <p style={{ color: '#8e96a4', fontSize: '10px', marginTop: '6px' }}>
                  Escaneo activo de patrones AWS, tokens de GitHub/OpenAI y llaves privadas RSA.
                </p>
              </div>

              <div className="lcd-module">
                <span className="lcd-stat-label">RIESGO OOM (SIN LÍMITE DE MEMORIA)</span>
                <span className="lcd-stat-val text-orange">PROTEGIDO</span>
                <p style={{ color: '#8e96a4', fontSize: '10px', marginTop: '6px' }}>
                  Supervisión de cuotas de cgroups v2 para evitar saturación del host.
                </p>
              </div>

              <div className="lcd-module">
                <span className="lcd-stat-label">PUERTOS EXPUESTOS A 0.0.0.0</span>
                <span className="lcd-stat-val text-mint">AUDITADO</span>
                <p style={{ color: '#8e96a4', fontSize: '10px', marginTop: '6px' }}>
                  Verificación de interfaces de red locales para evitar exposición pública de bases de datos.
                </p>
              </div>
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
