// ==============================================================================
// PodVanguard - Controlador Reactivo de Interfaz Web (Frontend SPA)
// Autor: Ismael Sallami Moreno
//
// Este script orquesta la lógica del cliente web: navegación entre paneles,
// sincronización REST, túneles WebSocket para terminal TTY y logs continuos,
// renderizado de topología SVG y motor de notificaciones.
// ==============================================================================

const App = {
  activeTab: 'overview',
  containers: [],
  pods: [],
  images: [],
  volumes: [],
  statsWs: null,
  execWs: null,
  logsWs: null,
  selectedContainerForTerm: '',
  selectedContainerForLogs: '',

  init() {
    this.bindEvents();
    this.initTelemetryWs();
    this.loadInitialData();

    // Auto-refresco de vista cada 15 segundos
    setInterval(() => {
      if (this.activeTab === 'overview' || this.activeTab === 'containers') {
        this.loadContainers();
      }
    }, 15000);
  },

  // Vinculación de eventos DOM
  bindEvents() {
    // Pestañas de navegación
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Enlaces de salto rápido
    document.querySelectorAll('[data-jump-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-jump-tab');
        this.switchTab(tab);
      });
    });

    // Botón refresco global
    document.getElementById('btn-refresh').addEventListener('click', () => {
      this.refreshCurrentTab();
      this.showToast('Datos actualizados', 'success');
    });

    // Contenedores
    document.getElementById('btn-refresh-containers').addEventListener('click', () => this.loadContainers());
    document.getElementById('container-search-input').addEventListener('input', (e) => this.filterContainers(e.target.value));
    document.getElementById('chk-show-all-containers').addEventListener('change', () => this.loadContainers());

    // Kubernetes
    document.getElementById('btn-refresh-pods').addEventListener('click', () => this.loadPods());
    document.getElementById('k8s-namespace-select').addEventListener('change', () => this.loadPods());
    document.getElementById('k8s-search-input').addEventListener('input', (e) => this.filterPods(e.target.value));

    // Terminal Web
    document.getElementById('btn-connect-terminal').addEventListener('click', () => this.connectTerminal());
    document.getElementById('btn-clear-terminal').addEventListener('click', () => {
      document.getElementById('terminal-output').innerHTML = '';
    });
    document.getElementById('terminal-input').addEventListener('keydown', (e) => this.handleTerminalInput(e));

    // Logs en Vivo
    document.getElementById('logs-container-select').addEventListener('change', (e) => {
      this.selectedContainerForLogs = e.target.value;
      this.connectLogs();
    });
    document.getElementById('logs-filter-input').addEventListener('input', () => this.connectLogs());
    document.getElementById('btn-clear-logs').addEventListener('click', () => {
      document.getElementById('logs-output-window').innerHTML = '';
    });

    // Topología
    document.getElementById('btn-refresh-topology').addEventListener('click', () => this.loadTopology());

    // Sentinel Shield
    document.getElementById('btn-rescan-sentinel').addEventListener('click', () => this.loadSentinelAudit());

    // Pruner
    document.getElementById('btn-execute-prune').addEventListener('click', () => this.executePrune());

    // Imágenes y Volúmenes
    document.getElementById('btn-refresh-images').addEventListener('click', () => this.loadImages());
    document.getElementById('images-search-input').addEventListener('input', (e) => this.filterImages(e.target.value));
    document.getElementById('btn-refresh-volumes').addEventListener('click', () => this.loadVolumes());

    // Modal de Inspección
    document.getElementById('btn-close-inspect-modal').addEventListener('click', () => {
      document.getElementById('modal-inspect').style.display = 'none';
    });
    document.getElementById('modal-inspect').addEventListener('click', (e) => {
      if (e.target.id === 'modal-inspect') {
        document.getElementById('modal-inspect').style.display = 'none';
      }
    });
  },

  // Cambio reactivo de pestaña
  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    if (activeNav) activeNav.classList.add('active');

    document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
    const activeView = document.getElementById(`view-${tab}`);
    if (activeView) activeView.classList.add('active');

    const titles = {
      overview: 'Panel General',
      containers: 'Gestión de Contenedores',
      pods: 'Kubernetes Pods & Clúster',
      terminal: 'Terminal Web Interactivo',
      logs: 'Transmisión de Logs en Vivo',
      topology: 'Topología de Red e Infraestructura',
      sentinel: 'Vanguard Sentinel Shield',
      pruner: 'Motor de Poda y Espacio de Almacenamiento',
      images: 'Imágenes Locales de Contenedores',
      volumes: 'Volúmenes Persistentes de Docker',
    };
    document.getElementById('current-view-title').textContent = titles[tab] || 'PodVanguard';

    this.refreshCurrentTab();
  },

  refreshCurrentTab() {
    this.loadSystemStatus();
    switch (this.activeTab) {
      case 'overview':
        this.loadContainers();
        this.loadSentinelAudit();
        this.loadPrunerScan();
        break;
      case 'containers':
        this.loadContainers();
        break;
      case 'pods':
        this.loadPods();
        this.loadK8sNamespaces();
        break;
      case 'terminal':
        this.populateContainerDropdowns();
        break;
      case 'logs':
        this.populateContainerDropdowns();
        break;
      case 'topology':
        this.loadTopology();
        break;
      case 'sentinel':
        this.loadSentinelAudit();
        break;
      case 'pruner':
        this.loadPrunerScan();
        break;
      case 'images':
        this.loadImages();
        break;
      case 'volumes':
        this.loadVolumes();
        break;
    }
  },

  loadInitialData() {
    this.loadSystemStatus();
    this.loadContainers();
    this.loadSentinelAudit();
    this.loadPrunerScan();
    this.loadPods();
  },

  // WebSocket de Telemetría Host en tiempo real
  initTelemetryWs() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/stats`;

    try {
      this.statsWs = new WebSocket(wsUrl);
      this.statsWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.host) {
            const cpu = data.host.cpu_usage_percent;
            const memPct = data.host.memory_percent;

            document.getElementById('telemetry-cpu-val').textContent = `${cpu.toFixed(1)}%`;
            document.getElementById('telemetry-cpu-bar').style.width = `${Math.min(cpu, 100)}%`;

            document.getElementById('telemetry-mem-val').textContent = `${memPct.toFixed(1)}%`;
            document.getElementById('telemetry-mem-bar').style.width = `${Math.min(memPct, 100)}%`;
          }
        } catch (_) {}
      };
      this.statsWs.onclose = () => {
        setTimeout(() => this.initTelemetryWs(), 5000);
      };
    } catch (_) {}
  },

  // ==============================================================================
  // CARGA DE DATOS REST
  // ==============================================================================

  async loadSystemStatus() {
    try {
      const res = await fetch('/api/system/status');
      if (!res.ok) return;
      const data = await res.json();

      document.getElementById('meta-kernel').textContent = `${data.os_name} ${data.kernel_version}`;

      const dockerPill = document.getElementById('docker-status-pill');
      if (data.docker_connected) {
        dockerPill.innerHTML = '<span class="dot dot-emerald"></span><span class="label">Docker: Conectado</span>';
      } else {
        dockerPill.innerHTML = '<span class="dot dot-rose"></span><span class="label">Docker: Inactivo</span>';
      }

      const k8sPill = document.getElementById('k8s-status-pill');
      const k8sLabel = document.getElementById('k8s-status-label');
      if (data.k8s_status && data.k8s_status.connected) {
        k8sPill.innerHTML = `<span class="dot dot-emerald"></span><span class="label">K8s: ${data.k8s_status.current_context}</span>`;
        document.getElementById('badge-pods-count').textContent = data.k8s_status.total_pods;
        document.getElementById('overview-k8s-pods').textContent = data.k8s_status.total_pods;
        document.getElementById('overview-k8s-namespaces').textContent = `${data.k8s_status.total_namespaces} Espacios de nombres`;
      } else {
        k8sPill.innerHTML = '<span class="dot dot-amber"></span><span class="label">K8s: Sin Clúster</span>';
        document.getElementById('overview-k8s-pods').textContent = '0';
        document.getElementById('overview-k8s-namespaces').textContent = 'Modo Autónomo Docker';
      }
    } catch (_) {}
  },

  async loadContainers() {
    const showAll = document.getElementById('chk-show-all-containers').checked;
    try {
      const res = await fetch(`/api/docker/containers?all=${showAll}`);
      if (!res.ok) throw new Error('Error al listar contenedores');
      this.containers = await res.json();

      const runningCount = this.containers.filter(c => c.state.toLowerCase() === 'running').length;
      document.getElementById('badge-containers-count').textContent = runningCount;
      document.getElementById('overview-running-containers').textContent = runningCount;
      document.getElementById('overview-total-containers').textContent = `Total: ${this.containers.length}`;

      this.renderContainersTable(this.containers);
      this.renderOverviewContainersTable(this.containers);
      this.populateContainerDropdowns();
    } catch (e) {
      document.getElementById('containers-tbody').innerHTML = `<tr><td colspan="7" class="text-center text-rose">${e.message}</td></tr>`;
    }
  },

  renderContainersTable(containers) {
    const tbody = document.getElementById('containers-tbody');
    if (containers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No hay contenedores registrados en el host.</td></tr>';
      return;
    }

    tbody.innerHTML = containers.map(c => {
      const isRunning = c.state.toLowerCase() === 'running';
      const isPaused = c.state.toLowerCase() === 'paused';
      const stateBadge = isRunning
        ? '<span class="badge badge-emerald">En Ejecución</span>'
        : isPaused
        ? '<span class="badge badge-amber">Pausado</span>'
        : '<span class="badge badge-rose">Detenido</span>';

      const portsStr = c.ports && c.ports.length > 0 ? c.ports.join(', ') : '-';

      return `
        <tr>
          <td>${stateBadge}</td>
          <td><strong>${c.name}</strong></td>
          <td><code class="text-cyan">${c.short_id}</code></td>
          <td><span class="text-muted text-sm">${c.image}</span></td>
          <td><span class="text-sm font-mono">${portsStr}</span></td>
          <td><span class="text-sm text-dim">${c.status}</span></td>
          <td>
            <div class="btn-group">
              ${isRunning
                ? `<button class="btn btn-sm btn-secondary" onclick="App.containerAction('${c.id}', 'stop')">Detener</button>
                   <button class="btn btn-sm btn-secondary" onclick="App.containerAction('${c.id}', 'restart')">Reiniciar</button>`
                : `<button class="btn btn-sm btn-primary" onclick="App.containerAction('${c.id}', 'start')">Iniciar</button>`}
              <button class="btn btn-sm btn-outline" onclick="App.inspectContainer('${c.id}')">Inspeccionar</button>
              <button class="btn btn-sm btn-danger" onclick="App.removeContainer('${c.id}')">Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderOverviewContainersTable(containers) {
    const tbody = document.getElementById('overview-containers-tbody');
    const recent = containers.slice(0, 5);

    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay contenedores activos.</td></tr>';
      return;
    }

    tbody.innerHTML = recent.map(c => {
      const isRunning = c.state.toLowerCase() === 'running';
      const dot = isRunning ? '<span class="dot dot-emerald"></span>' : '<span class="dot dot-rose"></span>';
      return `
        <tr>
          <td>${dot} <span class="text-sm">${c.state}</span></td>
          <td><strong>${c.name}</strong></td>
          <td><span class="text-sm text-muted">${c.image}</span></td>
          <td><span class="text-sm font-mono">${c.ports[0] || '-'}</span></td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="App.inspectContainer('${c.id}')">Ver</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterContainers(query) {
    const q = query.toLowerCase();
    const filtered = this.containers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.image.toLowerCase().includes(q)
    );
    this.renderContainersTable(filtered);
  },

  async containerAction(id, action) {
    try {
      const res = await fetch(`/api/docker/containers/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`Acción '${action}' ejecutada con éxito`, 'success');
        this.loadContainers();
      } else {
        this.showToast(`Fallo en acción: ${data.error || data.message || 'Error'}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error de red: ${e.message}`, 'error');
    }
  },

  async removeContainer(id) {
    if (!confirm(`¿Confirmas la eliminación del contenedor ${id.slice(0, 12)}?`)) return;
    try {
      const res = await fetch(`/api/docker/containers/${id}/remove?force=true`, { method: 'POST' });
      if (res.ok) {
        this.showToast('Contenedor eliminado del host', 'success');
        this.loadContainers();
      } else {
        this.showToast('Error al eliminar contenedor', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  },

  async inspectContainer(id) {
    try {
      const res = await fetch(`/api/docker/containers/${id}`);
      if (!res.ok) throw new Error('No se pudo inspeccionar el contenedor');
      const data = await res.json();

      document.getElementById('inspect-modal-title').textContent = `Inspección: ${data.name} (${data.id.slice(0, 12)})`;
      document.getElementById('inspect-modal-content').textContent = JSON.stringify(data, null, 2);
      document.getElementById('modal-inspect').style.display = 'flex';
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  },

  populateContainerDropdowns() {
    const termSelect = document.getElementById('terminal-container-select');
    const logsSelect = document.getElementById('logs-container-select');

    const running = this.containers.filter(c => c.state.toLowerCase() === 'running');

    const options = running.map(c => `<option value="${c.id}">${c.name} (${c.short_id})</option>`).join('');

    termSelect.innerHTML = `<option value="">Selecciona un contenedor en ejecución (${running.length} disponibles)...</option>` + options;
    logsSelect.innerHTML = `<option value="">Selecciona un contenedor (${this.containers.length} disponibles)...</option>` +
      this.containers.map(c => `<option value="${c.id}">${c.name} (${c.short_id})</option>`).join('');

    if (this.selectedContainerForTerm) termSelect.value = this.selectedContainerForTerm;
    if (this.selectedContainerForLogs) logsSelect.value = this.selectedContainerForLogs;
  },

  // ==============================================================================
  // KUBERNETES
  // ==============================================================================

  async loadPods() {
    const ns = document.getElementById('k8s-namespace-select').value || 'all';
    try {
      const res = await fetch(`/api/k8s/pods?namespace=${ns}`);
      if (!res.ok) throw new Error('Error al consultar pods de Kubernetes');
      this.pods = await res.json();
      this.renderPodsTable(this.pods);
    } catch (e) {
      document.getElementById('pods-tbody').innerHTML = `<tr><td colspan="8" class="text-center text-muted">${e.message}</td></tr>`;
    }
  },

  async loadK8sNamespaces() {
    try {
      const res = await fetch('/api/k8s/namespaces');
      if (!res.ok) return;
      const namespaces = await res.json();
      const select = document.getElementById('k8s-namespace-select');
      const current = select.value;

      select.innerHTML = '<option value="all">Todos los Namespaces</option>' +
        namespaces.map(ns => `<option value="${ns.name}">${ns.name}</option>`).join('');

      if (current) select.value = current;
    } catch (_) {}
  },

  renderPodsTable(pods) {
    const tbody = document.getElementById('pods-tbody');
    if (pods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No se detectaron pods en el clúster actual.</td></tr>';
      return;
    }

    tbody.innerHTML = pods.map(p => {
      const isRunning = p.status.toLowerCase() === 'running';
      const badgeClass = isRunning ? 'badge-emerald' : 'badge-amber';

      return `
        <tr>
          <td><span class="badge badge-violet">${p.namespace}</span></td>
          <td><strong>${p.name}</strong></td>
          <td><span class="badge ${badgeClass}">${p.status}</span></td>
          <td><span class="font-mono text-cyan">${p.ready_containers}</span></td>
          <td>${p.restarts > 0 ? `<span class="text-rose font-bold">${p.restarts}</span>` : '0'}</td>
          <td><span class="text-sm text-dim">${p.node}</span></td>
          <td><span class="text-sm font-mono">${p.ip}</span></td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="App.viewPodLogs('${p.namespace}', '${p.name}')">Logs</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterPods(query) {
    const q = query.toLowerCase();
    const filtered = this.pods.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.namespace.toLowerCase().includes(q)
    );
    this.renderPodsTable(filtered);
  },

  async viewPodLogs(namespace, name) {
    try {
      const res = await fetch(`/api/k8s/pods/${namespace}/${name}/logs?tail=200`);
      const logs = await res.text();
      document.getElementById('inspect-modal-title').textContent = `Logs de Pod: ${namespace}/${name}`;
      document.getElementById('inspect-modal-content').textContent = logs;
      document.getElementById('modal-inspect').style.display = 'flex';
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  },

  // ==============================================================================
  // TERMINAL WEB (XTERM EXEC WEBSOCKET)
  // ==============================================================================

  connectTerminal() {
    const select = document.getElementById('terminal-container-select');
    const containerId = select.value;
    if (!containerId) {
      this.showToast('Por favor selecciona un contenedor en ejecución', 'error');
      return;
    }

    if (this.execWs) {
      this.execWs.close();
      this.execWs = null;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/exec/${containerId}`;

    const out = document.getElementById('terminal-output');
    out.innerHTML = `\r\n\x1b[36m[PodVanguard] Conectando a shell interactiva en ${containerId.slice(0, 12)}...\x1b[0m\r\n`;

    const statusDot = document.getElementById('term-status-dot');
    const statusText = document.getElementById('term-status-text');

    statusDot.className = 'dot dot-amber';
    statusText.textContent = 'Conectando...';

    try {
      this.execWs = new WebSocket(wsUrl);
      this.execWs.binaryType = 'arraybuffer';

      this.execWs.onopen = () => {
        statusDot.className = 'dot dot-emerald';
        statusText.textContent = 'Conectado (TTY activo)';
        this.showToast('Sesión de terminal activa', 'success');
        document.getElementById('terminal-input').focus();
      };

      this.execWs.onmessage = (event) => {
        if (typeof event.data === 'string') {
          out.innerHTML += this.escapeHtml(event.data);
        } else {
          const dec = new TextDecoder('utf-8');
          out.innerHTML += this.escapeHtml(dec.decode(event.data));
        }
        out.scrollTop = out.scrollHeight;
      };

      this.execWs.onclose = () => {
        statusDot.className = 'dot dot-rose';
        statusText.textContent = 'Desconectado';
        out.innerHTML += '\r\n\x1b[33m[PodVanguard] Sesión de terminal finalizada por el servidor.\x1b[0m\r\n';
      };

      this.execWs.onerror = () => {
        statusDot.className = 'dot dot-rose';
        statusText.textContent = 'Error';
      };
    } catch (e) {
      this.showToast(`Error al abrir socket: ${e.message}`, 'error');
    }
  },

  handleTerminalInput(e) {
    if (e.key === 'Enter') {
      const input = document.getElementById('terminal-input');
      const val = input.value;
      if (this.execWs && this.execWs.readyState === WebSocket.OPEN) {
        this.execWs.send(val + '\n');
      }
      input.value = '';
    }
  },

  // ==============================================================================
  // LOGS EN VIVO (FOLLOW LOGS WEBSOCKET)
  // ==============================================================================

  connectLogs() {
    const containerId = this.selectedContainerForLogs;
    if (!containerId) return;

    if (this.logsWs) {
      this.logsWs.close();
      this.logsWs = null;
    }

    const filterVal = encodeURIComponent(document.getElementById('logs-filter-input').value.trim());
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/logs/${containerId}?filter=${filterVal}`;

    const win = document.getElementById('logs-output-window');
    win.innerHTML = `<span class="text-cyan">[PodVanguard Logs] Transmitiendo logs para ${containerId.slice(0, 12)}...</span>\n\n`;

    try {
      this.logsWs = new WebSocket(wsUrl);
      this.logsWs.onmessage = (event) => {
        win.appendChild(document.createTextNode(event.data));
        if (document.getElementById('chk-logs-autoscroll').checked) {
          win.scrollTop = win.scrollHeight;
        }
      };
      this.logsWs.onclose = () => {
        win.appendChild(document.createTextNode('\n[PodVanguard Logs] Flujo finalizado.\n'));
      };
    } catch (_) {}
  },

  // ==============================================================================
  // TOPOLOGÍA DE RED (GRAFO SVG INTERACTIVO)
  // ==============================================================================

  async loadTopology() {
    try {
      const res = await fetch('/api/topology');
      if (!res.ok) throw new Error('Error al cargar topología');
      const data = await res.json();
      this.renderTopologySvg(data);
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  },

  renderTopologySvg(graph) {
    const svg = document.getElementById('topology-svg');
    const width = svg.clientWidth || 900;
    const height = 550;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    if (graph.nodes.length === 0) {
      svg.innerHTML = `<text x="${width/2}" y="${height/2}" text-anchor="middle" fill="#64748b" font-size="14">No se detectaron recursos de red o contenedores para graficar.</text>`;
      return;
    }

    // Algoritmo de distribución espacial: Redes en la columna central, Contenedores a los lados
    const nodeMap = new Map();
    const networkNodes = graph.nodes.filter(n => n.node_type === 'network');
    const containerNodes = graph.nodes.filter(n => n.node_type === 'container');
    const portNodes = graph.nodes.filter(n => n.node_type === 'port');
    const volumeNodes = graph.nodes.filter(n => n.node_type === 'volume');

    // Posicionamiento de Redes (Centro)
    networkNodes.forEach((n, i) => {
      const spacing = height / (networkNodes.length + 1);
      n.x = width * 0.45;
      n.y = spacing * (i + 1);
      nodeMap.set(n.id, n);
    });

    // Posicionamiento de Contenedores (Columna derecha)
    containerNodes.forEach((n, i) => {
      const spacing = height / (containerNodes.length + 1);
      n.x = width * 0.75;
      n.y = spacing * (i + 1);
      nodeMap.set(n.id, n);
    });

    // Posicionamiento de Puertos (Extremo derecho)
    portNodes.forEach((n, i) => {
      const spacing = height / (portNodes.length + 1);
      n.x = width * 0.92;
      n.y = spacing * (i + 1);
      nodeMap.set(n.id, n);
    });

    // Posicionamiento de Volúmenes (Columna izquierda)
    volumeNodes.forEach((n, i) => {
      const spacing = height / (volumeNodes.length + 1);
      n.x = width * 0.15;
      n.y = spacing * (i + 1);
      nodeMap.set(n.id, n);
    });

    let html = `
      <defs>
        <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
    `;

    // 1. Dibujar Enlaces (Aristas)
    graph.links.forEach(l => {
      const src = nodeMap.get(l.source);
      const tgt = nodeMap.get(l.target);
      if (src && tgt) {
        const strokeColor = l.link_type === 'network' ? '#06b6d4' : l.link_type === 'port' ? '#10b981' : '#f59e0b';
        html += `
          <path d="M ${src.x} ${src.y} C ${(src.x + tgt.x)/2} ${src.y}, ${(src.x + tgt.x)/2} ${tgt.y}, ${tgt.x} ${tgt.y}"
                stroke="${strokeColor}" stroke-width="2" stroke-opacity="0.5" fill="none" stroke-dasharray="${l.link_type === 'network' ? '4,4' : 'none'}"/>
        `;
      }
    });

    // 2. Dibujar Nodos
    graph.nodes.forEach(n => {
      if (!n.x) return;
      const isRunning = n.status.toLowerCase() === 'running' || n.status === 'active';
      let fillColor = '#1e293b';
      let strokeColor = '#475569';
      let r = 24;

      if (n.node_type === 'network') {
        fillColor = 'rgba(6, 182, 212, 0.15)';
        strokeColor = '#06b6d4';
        r = 30;
      } else if (n.node_type === 'container') {
        fillColor = isRunning ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';
        strokeColor = isRunning ? '#10b981' : '#f43f5e';
      } else if (n.node_type === 'port') {
        fillColor = 'rgba(139, 92, 246, 0.15)';
        strokeColor = '#8b5cf6';
        r = 18;
      } else if (n.node_type === 'volume') {
        fillColor = 'rgba(245, 158, 11, 0.15)';
        strokeColor = '#f59e0b';
        r = 20;
      }

      html += `
        <g class="topology-node" style="cursor: pointer;" onclick="App.showToast('Nodo: ${n.label}', 'info')">
          <circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" />
          <text x="${n.x}" y="${n.y + 4}" fill="#f8fafc" font-size="11" font-weight="600" text-anchor="middle" font-family="sans-serif">
            ${n.label.slice(0, 10)}
          </text>
          <text x="${n.x}" y="${n.y + r + 14}" fill="#94a3b8" font-size="10" text-anchor="middle">
            ${n.node_type}
          </text>
        </g>
      `;
    });

    svg.innerHTML = html;
  },

  // ==============================================================================
  // SENTINEL SHIELD (AUDITORÍA DE SEGURIDAD)
  // ==============================================================================

  async loadSentinelAudit() {
    try {
      const res = await fetch('/api/sentinel/audit');
      if (!res.ok) throw new Error('Error al ejecutar auditoría Sentinel');
      const data = await res.json();

      document.getElementById('shield-score-val').textContent = data.score;
      document.getElementById('badge-sentinel-score').textContent = data.score;
      document.getElementById('overview-security-score').textContent = `${data.score}/100`;

      const scoreCircle = document.getElementById('sentinel-score-circle');
      scoreCircle.textContent = data.score;
      if (data.score >= 80) {
        scoreCircle.style.borderColor = '#10b981';
        scoreCircle.style.color = '#10b981';
      } else if (data.score >= 50) {
        scoreCircle.style.borderColor = '#f59e0b';
        scoreCircle.style.color = '#f59e0b';
      } else {
        scoreCircle.style.borderColor = '#f43f5e';
        scoreCircle.style.color = '#f43f5e';
      }

      document.getElementById('sentinel-crit-count').textContent = data.critical_count;
      document.getElementById('sentinel-warn-count').textContent = data.warning_count;
      document.getElementById('sentinel-info-count').textContent = data.info_count;
      document.getElementById('overview-security-status').textContent = `${data.critical_count} Críticos, ${data.warning_count} Advertencias`;

      this.renderSentinelFindings(data.findings);
    } catch (e) {
      document.getElementById('sentinel-findings-container').innerHTML = `<div class="text-rose text-center">${e.message}</div>`;
    }
  },

  renderSentinelFindings(findings) {
    const container = document.getElementById('sentinel-findings-container');
    const quickList = document.getElementById('overview-sentinel-quick-findings');

    if (findings.length === 0) {
      container.innerHTML = '<div class="text-center text-emerald py-4">Excelente postura: 0 vulnerabilidades detectadas por Sentinel Shield.</div>';
      quickList.innerHTML = '<p class="text-emerald text-sm">Postura óptima: No se han detectado brechas de seguridad.</p>';
      return;
    }

    container.innerHTML = findings.map(f => {
      const sevClass = f.severity.toLowerCase() === 'critical'
        ? 'severity-critical'
        : f.severity.toLowerCase() === 'warning'
        ? 'severity-warning'
        : '';

      const badge = f.severity.toLowerCase() === 'critical'
        ? '<span class="badge badge-rose">CRÍTICO</span>'
        : f.severity.toLowerCase() === 'warning'
        ? '<span class="badge badge-amber">ADVERTENCIA</span>'
        : '<span class="badge badge-cyan">INFO</span>';

      return `
        <div class="finding-card ${sevClass}">
          <div class="finding-header">
            <div>
              ${badge}
              <span class="finding-title ml-2">${f.title}</span>
              <span class="text-dim text-sm">(${f.rule_id})</span>
            </div>
            <span class="badge">${f.container_name}</span>
          </div>
          <p class="finding-desc">${f.description}</p>
          <div class="finding-remediation">
            <strong>Remediación:</strong> ${f.remediation}
          </div>
        </div>
      `;
    }).join('');

    // Lista rápida para el dashboard general
    quickList.innerHTML = findings.slice(0, 3).map(f => `
      <div class="text-sm py-1 border-b border-gray-800">
        <strong class="${f.severity === 'CRITICAL' ? 'text-rose' : 'text-amber'}">${f.title}</strong>
        <span class="text-muted text-xs block">en ${f.container_name}</span>
      </div>
    `).join('');
  },

  // ==============================================================================
  // PRUNER (LIMPIEZA DE ALMACENAMIENTO)
  // ==============================================================================

  async loadPrunerScan() {
    try {
      const res = await fetch('/api/pruner/scan');
      if (!res.ok) return;
      const data = await res.json();

      document.getElementById('overview-reclaimable').textContent = data.total_reclaimable_human;
      document.getElementById('pruner-reclaimable-total').textContent = data.total_reclaimable_human;

      document.getElementById('pruner-cnt-count').textContent = data.stopped_containers_count;
      document.getElementById('pruner-cnt-size').textContent = this.formatBytes(data.stopped_containers_size_bytes);

      document.getElementById('pruner-img-count').textContent = data.dangling_images_count;
      document.getElementById('pruner-img-size').textContent = this.formatBytes(data.dangling_images_size_bytes);

      document.getElementById('pruner-vol-count').textContent = data.dangling_volumes_count;
      document.getElementById('pruner-vol-size').textContent = this.formatBytes(data.dangling_volumes_size_bytes);
    } catch (_) {}
  },

  async executePrune() {
    if (!confirm('¿Deseas purgar ahora contenedores parados, imágenes huérfanas y volúmenes desconectados?')) return;
    try {
      const btn = document.getElementById('btn-execute-prune');
      btn.disabled = true;
      btn.textContent = 'Purgando almacenamiento...';

      const res = await fetch('/api/pruner/clean', { method: 'POST' });
      const report = await res.json();

      btn.disabled = false;
      btn.textContent = 'Ejecutar Purga de Almacenamiento';

      if (res.ok) {
        this.showToast(`¡Saneamiento completado! Liberados: ${report.total_reclaimed_human}`, 'success');
        this.loadPrunerScan();
        this.loadContainers();
      } else {
        this.showToast('Fallo al ejecutar saneamiento', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  },

  // ==============================================================================
  // IMÁGENES Y VOLÚMENES
  // ==============================================================================

  async loadImages() {
    try {
      const res = await fetch('/api/docker/images');
      if (!res.ok) throw new Error('Error al listar imágenes');
      this.images = await res.json();
      this.renderImagesTable(this.images);
    } catch (e) {
      document.getElementById('images-tbody').innerHTML = `<tr><td colspan="4" class="text-center text-rose">${e.message}</td></tr>`;
    }
  },

  renderImagesTable(images) {
    const tbody = document.getElementById('images-tbody');
    if (images.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay imágenes en la caché local.</td></tr>';
      return;
    }

    tbody.innerHTML = images.map(img => {
      const tags = img.repo_tags && img.repo_tags.length > 0
        ? img.repo_tags.map(t => `<span class="badge badge-cyan">${t}</span>`).join(' ')
        : '<span class="text-dim">&lt;none&gt; (Dangling)</span>';

      return `
        <tr>
          <td>${tags}</td>
          <td><code class="text-cyan">${img.short_id}</code></td>
          <td><span class="font-mono">${this.formatBytes(img.size_bytes)}</span></td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="App.removeImage('${img.id}')">Eliminar</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterImages(query) {
    const q = query.toLowerCase();
    const filtered = this.images.filter(img =>
      (img.repo_tags && img.repo_tags.some(t => t.toLowerCase().includes(q))) ||
      img.id.toLowerCase().includes(q)
    );
    this.renderImagesTable(filtered);
  },

  async removeImage(id) {
    if (!confirm(`¿Eliminar la imagen ${id.slice(0, 12)}?`)) return;
    try {
      const res = await fetch(`/api/docker/images/${id}?force=false`, { method: 'DELETE' });
      if (res.ok) {
        this.showToast('Imagen eliminada con éxito', 'success');
        this.loadImages();
      } else {
        this.showToast('Error al eliminar imagen (puede estar en uso por un contenedor)', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  },

  async loadVolumes() {
    try {
      const res = await fetch('/api/docker/volumes');
      if (!res.ok) throw new Error('Error al listar volúmenes');
      this.volumes = await res.json();
      this.renderVolumesTable(this.volumes);
    } catch (e) {
      document.getElementById('volumes-tbody').innerHTML = `<tr><td colspan="4" class="text-center text-rose">${e.message}</td></tr>`;
    }
  },

  renderVolumesTable(volumes) {
    const tbody = document.getElementById('volumes-tbody');
    if (volumes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No se detectaron volúmenes Docker.</td></tr>';
      return;
    }

    tbody.innerHTML = volumes.map(v => `
      <tr>
        <td><strong>${v.name}</strong></td>
        <td><span class="badge">${v.driver}</span></td>
        <td><span class="text-dim text-sm">${v.scope}</span></td>
        <td><span class="text-sm font-mono text-muted">${v.mountpoint}</span></td>
      </tr>
    `).join('');
  },

  // ==============================================================================
  // UTILIDADES
  // ==============================================================================

  formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
  },

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
};

// Arrancar aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => App.init());
