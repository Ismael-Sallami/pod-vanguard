import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Box, CircleDot, Terminal, FileText,
  Network, ShieldAlert, Trash2, Layers, HardDrive,
  RefreshCw, Search, Play, Square, RotateCw, Pause, Info,
  AlertTriangle, ShieldCheck, Zap, Command, Check, X
} from 'lucide-react';

import VuMeter from './components/VuMeter.jsx';
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

  // Toasts
  const [toasts, setToasts] = useState([]);

  // Telemetría en tiempo real
  const [cpuUsage, setCpuUsage] = useState(0);
  const [memUsage, setMemUsage] = useState(0);

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

    // Intervalo de actualización cada 15s
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
        if (!cpuUsage) setCpuUsage(data.cpu_usage_percent);
        if (!memUsage) setMemUsage(data.memory_usage_percent);
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

  // Acciones sobre contenedores
  const handleContainerAction = async (id, action) => {
    try {
      const res = await fetch(`/api/docker/containers/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Acción '${action}' ejecutada con éxito en ${id.slice(0, 8)}`, 'success');
        fetchContainers();
      } else {
        showToast(`Error: ${data.message || data.error}`, 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleRemoveContainer = async (id) => {
    if (!window.confirm(`¿Confirmas la eliminación del contenedor ${id.slice(0, 12)}?`)) return;
    try {
      const res = await fetch(`/api/docker/containers/${id}/remove?force=true`, { method: 'POST' });
      if (res.ok) {
        showToast('Contenedor eliminado del host', 'success');
        fetchContainers();
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleInspectContainer = async (id) => {
    try {
      const res = await fetch(`/api/docker/containers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setInspectData(data);
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Purga de almacenamiento
  const handleExecutePrune = async () => {
    if (!window.confirm('¿Deseas purgar ahora contenedores parados, imágenes huérfanas y volúmenes desconectados?')) return;
    try {
      const res = await fetch('/api/pruner/clean', { method: 'POST' });
      const report = await res.json();
      if (res.ok) {
        showToast(`¡Saneamiento exitoso! Liberados: ${report.total_reclaimed_human}`, 'success');
        fetchPruneScan();
        fetchContainers();
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Manejo de logs en vivo
  useEffect(() => {
    if (activeTab !== 'logs' || !logsContainerId) return;

    if (logsWsRef.current) {
      logsWsRef.current.close();
      logsWsRef.current = null;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const filterEncoded = encodeURIComponent(logsFilter.trim());
    const wsUrl = `${proto}//${window.location.host}/ws/logs/${logsContainerId}?filter=${filterEncoded}`;

    setLogsContent(`[PodVanguard Logs] Transmitiendo logs para ${logsContainerId.slice(0, 12)}...\n\n`);

    try {
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        setLogsContent(prev => prev + e.data);
        if (logsAutoScroll && logsWindowRef.current) {
          logsWindowRef.current.scrollTop = logsWindowRef.current.scrollHeight;
        }
      };
      logsWsRef.current = ws;
    } catch (_) {}

    return () => {
      if (logsWsRef.current) {
        logsWsRef.current.close();
      }
    };
  }, [activeTab, logsContainerId, logsFilter, logsAutoScroll]);

  // Manejo de acciones desde la Command Palette
  const handleCommandAction = (cmdId) => {
    if (cmdId.startsWith('tab-')) {
      const tab = cmdId.replace('tab-', '');
      setActiveTab(tab);
      if (tab === 'images') fetchImages();
      if (tab === 'volumes') fetchVolumes();
    } else if (cmdId === 'act-prune') {
      handleExecutePrune();
    } else if (cmdId === 'act-refresh') {
      fetchSystemStatus();
      fetchContainers();
      fetchPods();
      fetchSentinelAudit();
      fetchPruneScan();
      showToast('Telemetría y recursos actualizados', 'success');
    }
  };

  // Navegación con carga de pestaña
  const handleNavClick = (tab) => {
    setActiveTab(tab);
    if (tab === 'images') fetchImages();
    if (tab === 'volumes') fetchVolumes();
    if (tab === 'topology') fetchTopology();
    if (tab === 'sentinel') fetchSentinelAudit();
  };

  const runningContainers = containers.filter(c => c.state.toLowerCase() === 'running');

  return (
    <div className="app-container">
      {/* BARRA LATERAL ESTILO RACK TEENAGE ENGINEERING */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-wrapper">
            <div className="brand-glyph">PV</div>
            <div>
              <div className="brand-title">PodVanguard</div>
              <div className="brand-sub">CONTROL PLANE // R1</div>
            </div>
          </div>
        </div>

        <div className="kicker-label">Módulos de Sistema</div>

        <nav className="nav-stack">
          <button
            className={`nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleNavClick('overview')}
          >
            <LayoutDashboard size={15} />
            <span>[01] Resumen General</span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'containers' ? 'active' : ''}`}
            onClick={() => handleNavClick('containers')}
          >
            <Box size={15} />
            <span>[02] Contenedores</span>
            <span className="nav-badge">{runningContainers.length}/{containers.length}</span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'pods' ? 'active' : ''}`}
            onClick={() => handleNavClick('pods')}
          >
            <CircleDot size={15} />
            <span>[03] Kubernetes Pods</span>
            <span className="nav-badge" style={{ color: '#00C2FF' }}>{pods.length}</span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'terminal' ? 'active' : ''}`}
            onClick={() => handleNavClick('terminal')}
          >
            <Terminal size={15} />
            <span>[04] Terminal PTY</span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => handleNavClick('logs')}
          >
            <FileText size={15} />
            <span>[05] Logs en Vivo</span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'topology' ? 'active' : ''}`}
            onClick={() => handleNavClick('topology')}
          >
            <Network size={15} />
            <span>[06] Topología Red</span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'sentinel' ? 'active' : ''}`}
            onClick={() => handleNavClick('sentinel')}
          >
            <ShieldAlert size={15} />
            <span>[07] Sentinel Shield</span>
            <span className="nav-badge" style={{ color: '#00E575' }}>
              {sentinelReport ? sentinelReport.score : 100}
            </span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'pruner' ? 'active' : ''}`}
            onClick={() => handleNavClick('pruner')}
          >
            <Trash2 size={15} />
            <span>[08] Poda de Disco</span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'images' ? 'active' : ''}`}
            onClick={() => handleNavClick('images')}
          >
            <Layers size={15} />
            <span>[09] Imágenes</span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'volumes' ? 'active' : ''}`}
            onClick={() => handleNavClick('volumes')}
          >
            <HardDrive size={15} />
            <span>[10] Volúmenes</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="meta-engineer">
            <span>ISMAEL SALLAMI M.</span>
            <span style={{ color: '#FF5500' }}>[SENIOR]</span>
          </div>
          <div className="meta-sys">
            <span>LINUX X86_64</span>
            <span>V0.1.0</span>
          </div>
        </div>
      </aside>

      {/* ÁREA CENTRAL */}
      <main className="main-stage">
        {/* BARRA SUPERIOR MECÁNICA CON INDICADORES LED */}
        <header className="hardware-bar">
          <div className="hardware-title-group">
            <h1 className="hardware-page-title">{activeTab.toUpperCase()}</h1>

            <span className="signal-pill">
              <span className={`led ${systemStatus?.docker_connected ? 'led-green' : 'led-red'}`} />
              <span>DOCKER: {systemStatus?.docker_connected ? '/var/run/docker.sock' : 'OFFLINE'}</span>
            </span>

            <span className="signal-pill">
              <span className={`led ${systemStatus?.k8s_status?.connected ? 'led-green' : 'led-amber'}`} />
              <span>
                K8S: {systemStatus?.k8s_status?.connected ? systemStatus.k8s_status.current_context : 'STANDALONE'}
              </span>
            </span>
          </div>

          <div className="hardware-telemetry-group">
            <VuMeter label="CPU HOST" value={cpuUsage} />
            <VuMeter label="RAM HOST" value={memUsage} />

            <button
              className="mech-btn mech-btn-secondary mech-btn-sm"
              onClick={() => setIsCmdOpen(true)}
              title="Abrir Command Palette (Ctrl+K)"
            >
              <Command size={12} />
              <span>⌘K</span>
            </button>

            <button
              className="mech-btn mech-btn-secondary mech-btn-sm"
              onClick={() => {
                fetchSystemStatus();
                fetchContainers();
                fetchPods();
                showToast('Datos actualizados', 'success');
              }}
              title="Actualizar telemetría"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </header>

        {/* WORKBENCH VIEWPORT */}
        <div className="workbench">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div>
              <div className="metrics-grid">
                <div className="metric-cell">
                  <div className="metric-cell-tag">[01//CONTAINERS]</div>
                  <div className="metric-cell-val" style={{ color: '#00E575' }}>
                    {runningContainers.length}
                    <span style={{ fontSize: '14px', color: '#8E95A5' }}>/{containers.length}</span>
                  </div>
                  <div className="metric-cell-foot">En ejecución activa en el host</div>
                </div>

                <div className="metric-cell">
                  <div className="metric-cell-tag">[02//KUBERNETES]</div>
                  <div className="metric-cell-val" style={{ color: '#00C2FF' }}>
                    {pods.length}
                  </div>
                  <div className="metric-cell-foot">
                    {systemStatus?.k8s_status?.connected ? `${namespaces.length} Espacios de nombres` : 'Modo Autónomo Local'}
                  </div>
                </div>

                <div className="metric-cell">
                  <div className="metric-cell-tag">[03//SENTINEL_SHIELD]</div>
                  <div className="metric-cell-val" style={{ color: '#FF5500' }}>
                    {sentinelReport ? sentinelReport.score : 100}
                    <span style={{ fontSize: '14px', color: '#8E95A5' }}>/100</span>
                  </div>
                  <div className="metric-cell-foot">
                    {sentinelReport ? `${sentinelReport.critical_count} Críticos detectados` : 'Auditoría en curso'}
                  </div>
                </div>

                <div className="metric-cell">
                  <div className="metric-cell-tag">[04//DISK_RECLAIMABLE]</div>
                  <div className="metric-cell-val" style={{ color: '#FFB000' }}>
                    {pruneEstimate ? pruneEstimate.total_reclaimable_human : '0 B'}
                  </div>
                  <div className="metric-cell-foot">Espacio residual recuperable</div>
                </div>
              </div>

              {/* CONTENEDORES RECIENTES */}
              <div className="rack-card">
                <div className="rack-card-header">
                  <h3>
                    <Box size={14} color="#FF5500" />
                    <span>Contenedores en Ejecución Reciente</span>
                  </h3>
                  <button className="mech-btn mech-btn-secondary mech-btn-sm" onClick={() => setActiveTab('containers')}>
                    Ver Todos ({containers.length})
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table-rack">
                    <thead>
                      <tr>
                        <th>Estado</th>
                        <th>Nombre</th>
                        <th>ID Corto</th>
                        <th>Imagen</th>
                        <th>Puertos Expuestos</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containers.slice(0, 6).map(c => {
                        const isRunning = c.state.toLowerCase() === 'running';
                        return (
                          <tr key={c.id}>
                            <td>
                              <span className="signal-pill">
                                <span className={`led ${isRunning ? 'led-green' : 'led-red'}`} />
                                <span>{c.state.toUpperCase()}</span>
                              </span>
                            </td>
                            <td><strong>{c.name}</strong></td>
                            <td><code style={{ color: '#FF5500' }}>{c.short_id}</code></td>
                            <td><span style={{ color: '#8E95A5' }}>{c.image}</span></td>
                            <td><code style={{ fontSize: '11px' }}>{c.ports.join(', ') || '-'}</code></td>
                            <td>
                              <button
                                className="mech-btn mech-btn-secondary mech-btn-sm"
                                onClick={() => handleInspectContainer(c.id)}
                              >
                                Inspeccionar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {containers.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#525866' }}>
                            No se detectaron contenedores activos en el subsistema local.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONTENEDORES */}
          {activeTab === 'containers' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="text"
                    placeholder="Filtrar por nombre, imagen o ID..."
                    value={containerSearch}
                    onChange={e => setContainerSearch(e.target.value)}
                    style={{
                      backgroundColor: '#0A0C10',
                      border: '1px solid #1D222E',
                      color: '#EDEDED',
                      padding: '8px 14px',
                      borderRadius: 4,
                      fontSize: '12px',
                      width: '320px',
                      outline: 'none'
                    }}
                  />
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#8E95A5', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showAllContainers}
                      onChange={e => {
                        setShowAllContainers(e.target.checked);
                        fetchContainers();
                      }}
                    />
                    <span>Mostrar detenidos</span>
                  </label>
                </div>

                <button className="mech-btn mech-btn-primary" onClick={fetchContainers}>
                  <RefreshCw size={12} />
                  <span>Refrescar Contenedores</span>
                </button>
              </div>

              <div className="rack-card">
                <div style={{ overflowX: 'auto' }}>
                  <table className="table-rack">
                    <thead>
                      <tr>
                        <th>Estado</th>
                        <th>Nombre</th>
                        <th>ID</th>
                        <th>Imagen</th>
                        <th>Puertos</th>
                        <th>Docker Status</th>
                        <th>Acciones Táctiles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containers
                        .filter(c => 
                          c.name.toLowerCase().includes(containerSearch.toLowerCase()) ||
                          c.id.toLowerCase().includes(containerSearch.toLowerCase()) ||
                          c.image.toLowerCase().includes(containerSearch.toLowerCase())
                        )
                        .map(c => {
                          const isRunning = c.state.toLowerCase() === 'running';
                          return (
                            <tr key={c.id}>
                              <td>
                                <span className="signal-pill">
                                  <span className={`led ${isRunning ? 'led-green' : 'led-red'}`} />
                                  <span>{c.state.toUpperCase()}</span>
                                </span>
                              </td>
                              <td><strong>{c.name}</strong></td>
                              <td><code style={{ color: '#FF5500' }}>{c.short_id}</code></td>
                              <td><span style={{ color: '#8E95A5' }}>{c.image}</span></td>
                              <td><code style={{ fontSize: '11px' }}>{c.ports.join(', ') || '-'}</code></td>
                              <td><span style={{ color: '#525866' }}>{c.status}</span></td>
                              <td>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  {isRunning ? (
                                    <>
                                      <button
                                        className="mech-btn mech-btn-secondary mech-btn-sm"
                                        onClick={() => handleContainerAction(c.id, 'stop')}
                                        title="Detener"
                                      >
                                        <Square size={10} color="#FF2E4D" />
                                        <span>Stop</span>
                                      </button>
                                      <button
                                        className="mech-btn mech-btn-secondary mech-btn-sm"
                                        onClick={() => handleContainerAction(c.id, 'restart')}
                                        title="Reiniciar"
                                      >
                                        <RotateCw size={10} color="#FFB000" />
                                        <span>Restart</span>
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      className="mech-btn mech-btn-primary mech-btn-sm"
                                      onClick={() => handleContainerAction(c.id, 'start')}
                                      title="Iniciar"
                                    >
                                      <Play size={10} color="#000" />
                                      <span>Start</span>
                                    </button>
                                  )}
                                  <button
                                    className="mech-btn mech-btn-secondary mech-btn-sm"
                                    onClick={() => handleInspectContainer(c.id)}
                                  >
                                    <Info size={10} />
                                    <span>Info</span>
                                  </button>
                                  <button
                                    className="mech-btn mech-btn-danger mech-btn-sm"
                                    onClick={() => handleRemoveContainer(c.id)}
                                  >
                                    <Trash2 size={10} />
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
            </div>
          )}

          {/* TAB 3: KUBERNETES PODS */}
          {activeTab === 'pods' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <select
                    style={{
                      backgroundColor: '#0A0C10',
                      border: '1px solid #1D222E',
                      color: '#EDEDED',
                      padding: '8px 12px',
                      borderRadius: 4,
                      fontSize: '12px',
                      fontFamily: 'JetBrains Mono',
                      outline: 'none'
                    }}
                    value={selectedNamespace}
                    onChange={e => {
                      setSelectedNamespace(e.target.value);
                      fetchPods();
                    }}
                  >
                    <option value="all">Todos los Namespaces ({namespaces.length})</option>
                    {namespaces.map(ns => (
                      <option key={ns.name} value={ns.name}>{ns.name}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="Filtrar pods..."
                    value={podSearch}
                    onChange={e => setPodSearch(e.target.value)}
                    style={{
                      backgroundColor: '#0A0C10',
                      border: '1px solid #1D222E',
                      color: '#EDEDED',
                      padding: '8px 14px',
                      borderRadius: 4,
                      fontSize: '12px',
                      width: '280px',
                      outline: 'none'
                    }}
                  />
                </div>

                <button className="mech-btn mech-btn-primary" onClick={fetchPods}>
                  <RefreshCw size={12} />
                  <span>Refrescar Clúster</span>
                </button>
              </div>

              <div className="rack-card">
                <div style={{ overflowX: 'auto' }}>
                  <table className="table-rack">
                    <thead>
                      <tr>
                        <th>Namespace</th>
                        <th>Nombre Pod</th>
                        <th>Estado</th>
                        <th>Contenedores</th>
                        <th>Reinicios</th>
                        <th>Nodo</th>
                        <th>IP Pod</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pods
                        .filter(p => p.name.toLowerCase().includes(podSearch.toLowerCase()))
                        .map((p, idx) => (
                          <tr key={idx}>
                            <td><span style={{ color: '#00C2FF', fontFamily: 'JetBrains Mono' }}>{p.namespace}</span></td>
                            <td><strong>{p.name}</strong></td>
                            <td>
                              <span className="signal-pill">
                                <span className={`led ${p.status.toLowerCase() === 'running' ? 'led-green' : 'led-amber'}`} />
                                <span>{p.status.toUpperCase()}</span>
                              </span>
                            </td>
                            <td><code style={{ color: '#FF5500' }}>{p.ready_containers}</code></td>
                            <td>
                              {p.restarts > 0 ? (
                                <strong style={{ color: '#FF2E4D' }}>{p.restarts}</strong>
                              ) : (
                                <span style={{ color: '#525866' }}>0</span>
                              )}
                            </td>
                            <td><span style={{ color: '#8E95A5' }}>{p.node}</span></td>
                            <td><code style={{ fontSize: '11px' }}>{p.ip}</code></td>
                          </tr>
                        ))}
                      {pods.length === 0 && (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: '#525866' }}>
                            {systemStatus?.k8s_status?.connected
                              ? 'No se encontraron pods en el namespace seleccionado.'
                              : 'No hay clúster Kubernetes conectado en ~/.kube/config. Operando en modo local.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TERMINAL */}
          {activeTab === 'terminal' && (
            <TerminalView containers={containers} />
          )}

          {/* TAB 5: LOGS EN VIVO */}
          {activeTab === 'logs' && (
            <div className="term-box">
              <div className="term-topbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: '#8E95A5' }}>
                    CONTENEDOR:
                  </span>
                  <select
                    style={{
                      backgroundColor: '#0A0C10',
                      border: '1px solid #1D222E',
                      color: '#EDEDED',
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontFamily: 'JetBrains Mono',
                      fontSize: '11px',
                      outline: 'none'
                    }}
                    value={logsContainerId}
                    onChange={e => setLogsContainerId(e.target.value)}
                  >
                    <option value="">Selecciona un contenedor...</option>
                    {containers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.short_id})</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="Filtrar logs con Regex..."
                    value={logsFilter}
                    onChange={e => setLogsFilter(e.target.value)}
                    style={{
                      backgroundColor: '#0A0C10',
                      border: '1px solid #1D222E',
                      color: '#EDEDED',
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: '11px',
                      fontFamily: 'JetBrains Mono',
                      width: '200px',
                      outline: 'none'
                    }}
                  />

                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#8E95A5', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={logsAutoScroll}
                      onChange={e => setLogsAutoScroll(e.target.checked)}
                    />
                    <span>Auto-scroll</span>
                  </label>
                </div>

                <button
                  className="mech-btn mech-btn-secondary mech-btn-sm"
                  onClick={() => setLogsContent('')}
                >
                  <Trash2 size={12} />
                  <span>Limpiar</span>
                </button>
              </div>

              <div
                className="term-body"
                ref={logsWindowRef}
                style={{ color: '#EDEDED', whiteSpace: 'pre-wrap', overflowY: 'auto' }}
              >
                {logsContent || 'Selecciona un contenedor para iniciar la transmisión en vivo de logs.'}
              </div>
            </div>
          )}

          {/* TAB 6: TOPOLOGÍA DE RED */}
          {activeTab === 'topology' && (
            <TopologyCanvas graph={topologyGraph} onRefresh={fetchTopology} />
          )}

          {/* TAB 7: SENTINEL SHIELD */}
          {activeTab === 'sentinel' && sentinelReport && (
            <div>
              <div style={{
                background: 'linear-gradient(135deg, #121620 0%, #0A0D12 100%)',
                border: '1px solid #2A3142',
                borderRadius: 6,
                padding: '24px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <div style={{
                    width: '74px',
                    height: '74px',
                    borderRadius: '50%',
                    border: `4px solid ${sentinelReport.score >= 80 ? '#00E575' : sentinelReport.score >= 50 ? '#FFB000' : '#FF2E4D'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    fontWeight: '900',
                    fontFamily: 'JetBrains Mono',
                    color: sentinelReport.score >= 80 ? '#00E575' : sentinelReport.score >= 50 ? '#FFB000' : '#FF2E4D'
                  }}>
                    {sentinelReport.score}
                  </div>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Vanguard Sentinel Security Shield
                    </h2>
                    <p style={{ fontSize: '12px', color: '#8E95A5', marginTop: '4px' }}>
                      Auditoría heurística: Detección de claves de AWS/OpenAI/GitHub, modo privilegiado, UID 0 (root), puertos 0.0.0.0 y límites OOM.
                    </p>
                  </div>
                </div>

                <button className="mech-btn mech-btn-primary" onClick={fetchSentinelAudit}>
                  <ShieldCheck size={14} />
                  <span>Re-analizar Seguridad</span>
                </button>
              </div>

              <div className="rack-card">
                <div className="rack-card-header">
                  <h3>
                    <AlertTriangle size={14} color="#FF5500" />
                    <span>Hallazgos Heurísticos y Remediaciones ({sentinelReport.findings.length})</span>
                  </h3>
                </div>
                <div className="rack-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {sentinelReport.findings.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        backgroundColor: '#0A0C10',
                        border: '1px solid #1D222E',
                        borderLeft: `4px solid ${f.severity === 'CRITICAL' ? '#FF2E4D' : '#FFB000'}`,
                        borderRadius: 4,
                        padding: '16px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div>
                          <strong style={{ fontSize: '14px', color: '#EDEDED' }}>{f.title}</strong>
                          <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: '#525866', marginLeft: '8px' }}>
                            [{f.rule_id}]
                          </span>
                        </div>
                        <span className="signal-pill">
                          <span>{f.container_name}</span>
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#8E95A5', marginBottom: '8px' }}>{f.description}</p>
                      <div style={{
                        backgroundColor: '#0E1117',
                        padding: '8px 12px',
                        borderRadius: 4,
                        fontFamily: 'JetBrains Mono',
                        fontSize: '11px',
                        color: '#00C2FF'
                      }}>
                        <strong>Remediación:</strong> {f.remediation}
                      </div>
                    </div>
                  ))}
                  {sentinelReport.findings.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#00E575' }}>
                      ✓ Estado óptimo: No se encontraron anomalías heurísticas en los contenedores.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: PRUNER */}
          {activeTab === 'pruner' && pruneEstimate && (
            <div>
              <div style={{
                background: 'linear-gradient(135deg, #151922 0%, #0E1117 100%)',
                border: '1px solid #2A3142',
                borderRadius: 6,
                padding: '24px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '800', textTransform: 'uppercase' }}>
                    Saneamiento de Almacenamiento Residual
                  </h2>
                  <p style={{ fontSize: '12px', color: '#8E95A5', marginTop: '4px' }}>
                    Elimina capas huérfanas de Docker, contenedores parados y volúmenes desconectados sin interrumpir servicios vivos.
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', color: '#525866', textTransform: 'uppercase', fontFamily: 'JetBrains Mono' }}>
                    Espacio Recuperable
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#FFB000', fontFamily: 'JetBrains Mono' }}>
                    {pruneEstimate.total_reclaimable_human}
                  </div>
                </div>
              </div>

              <div className="metrics-grid">
                <div className="metric-cell">
                  <div className="metric-cell-tag">[CONTENEDORES PARADOS]</div>
                  <div className="metric-cell-val">{pruneEstimate.stopped_containers_count}</div>
                  <div className="metric-cell-foot">Retienen capas de escritura</div>
                </div>
                <div className="metric-cell">
                  <div className="metric-cell-tag">[IMÁGENES HUÉRFANAS]</div>
                  <div className="metric-cell-val">{pruneEstimate.dangling_images_count}</div>
                  <div className="metric-cell-foot">Capas sin etiquetar (dangling)</div>
                </div>
                <div className="metric-cell">
                  <div className="metric-cell-tag">[VOLÚMENES HUÉRFANOS]</div>
                  <div className="metric-cell-val">{pruneEstimate.dangling_volumes_count}</div>
                  <div className="metric-cell-foot">Volúmenes sin contenedor asociado</div>
                </div>
                <div className="metric-cell">
                  <div className="metric-cell-tag">[ACCIÓN PURGA]</div>
                  <div style={{ marginTop: '12px' }}>
                    <button className="mech-btn mech-btn-danger" onClick={handleExecutePrune}>
                      <Zap size={14} />
                      <span>Ejecutar Purga Total</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: IMÁGENES */}
          {activeTab === 'images' && (
            <div className="rack-card">
              <div className="rack-card-header">
                <h3><Layers size={14} color="#FF5500" /><span>Imágenes Locales de Contenedores ({images.length})</span></h3>
                <button className="mech-btn mech-btn-primary mech-btn-sm" onClick={fetchImages}>
                  <RefreshCw size={12} /><span>Refrescar</span>
                </button>
              </div>
              <table className="table-rack">
                <thead>
                  <tr>
                    <th>Etiquetas (Tags)</th>
                    <th>ID Corto</th>
                    <th>Tamaño en Disco</th>
                  </tr>
                </thead>
                <tbody>
                  {images.map(img => (
                    <tr key={img.id}>
                      <td>
                        {img.repo_tags && img.repo_tags.length > 0 ? (
                          img.repo_tags.map(t => (
                            <span key={t} style={{
                              backgroundColor: 'rgba(255, 85, 0, 0.1)',
                              border: '1px solid rgba(255, 85, 0, 0.3)',
                              color: '#FF5500',
                              padding: '2px 6px',
                              borderRadius: 3,
                              fontSize: '11px',
                              fontFamily: 'JetBrains Mono',
                              marginRight: 6
                            }}>
                              {t}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#525866' }}>&lt;none&gt; (Dangling)</span>
                        )}
                      </td>
                      <td><code style={{ color: '#00C2FF' }}>{img.short_id}</code></td>
                      <td><code style={{ color: '#EDEDED' }}>{(img.size_bytes / (1024 * 1024)).toFixed(1)} MB</code></td>
                    </tr>
                  ))}
                  {images.length === 0 && (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', padding: '24px', color: '#525866' }}>
                        No hay imágenes en la caché local.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 10: VOLÚMENES */}
          {activeTab === 'volumes' && (
            <div className="rack-card">
              <div className="rack-card-header">
                <h3><HardDrive size={14} color="#FF5500" /><span>Volúmenes Persistentes de Docker ({volumes.length})</span></h3>
                <button className="mech-btn mech-btn-primary mech-btn-sm" onClick={fetchVolumes}>
                  <RefreshCw size={12} /><span>Refrescar</span>
                </button>
              </div>
              <table className="table-rack">
                <thead>
                  <tr>
                    <th>Nombre de Volumen</th>
                    <th>Driver</th>
                    <th>Ámbito</th>
                    <th>Punto de Montaje en Host</th>
                  </tr>
                </thead>
                <tbody>
                  {volumes.map(v => (
                    <tr key={v.name}>
                      <td><strong>{v.name}</strong></td>
                      <td><span className="signal-pill"><span>{v.driver}</span></span></td>
                      <td><span style={{ color: '#8E95A5' }}>{v.scope}</span></td>
                      <td><code style={{ fontSize: '11px', color: '#525866' }}>{v.mountpoint}</code></td>
                    </tr>
                  ))}
                  {volumes.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: '#525866' }}>
                        No se detectaron volúmenes de almacenamiento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* MODAL DE INSPECCIÓN JSON */}
      {inspectData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: '#0E1117',
            border: '1px solid #2A3142',
            borderRadius: 6,
            width: '90%',
            maxWidth: '820px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid #1D222E',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <strong style={{ fontSize: '14px' }}>Inspección: {inspectData.name} ({inspectData.id.slice(0, 12)})</strong>
              <button
                style={{ background: 'none', border: 'none', color: '#8E95A5', cursor: 'pointer' }}
                onClick={() => setInspectData(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px', overflowY: 'auto' }}>
              <pre style={{
                fontFamily: 'JetBrains Mono',
                fontSize: '11px',
                color: '#00C2FF',
                backgroundColor: '#08090C',
                padding: '16px',
                borderRadius: 4,
                whiteSpace: 'pre-wrap'
              }}>
                {JSON.stringify(inspectData, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* COMMAND PALETTE (CTRL+K) */}
      <CommandPalette
        isOpen={isCmdOpen}
        onClose={() => setIsCmdOpen(false)}
        onSelectAction={handleCommandAction}
      />

      {/* BANDEJA DE TOASTS */}
      <div className="toast-rack">
        {toasts.map(t => (
          <div key={t.id} className={`toast-pill ${t.type}`}>
            {t.type === 'success' && <Check size={14} color="#00E575" />}
            {t.type === 'error' && <AlertTriangle size={14} color="#FF2E4D" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
