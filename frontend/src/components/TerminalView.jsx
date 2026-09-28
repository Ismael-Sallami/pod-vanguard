import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Play, Trash2, Power } from 'lucide-react';

export default function TerminalView({ containers }) {
  const [selectedId, setSelectedId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [output, setOutput] = useState('');
  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const wsRef = useRef(null);
  const outputRef = useRef(null);

  const runningContainers = containers.filter(c => c.state.toLowerCase() === 'running');

  // Seleccionar automáticamente el primer contenedor en ejecución si existe
  useEffect(() => {
    if (!selectedId && runningContainers.length > 0) {
      setSelectedId(runningContainers[0].id);
    }
  }, [runningContainers, selectedId]);

  // Limpiar socket al desmontar
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Auto-scroll al final del terminal
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const connectToContainer = () => {
    if (!selectedId) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/exec/${selectedId}`;

    setOutput(`\r\n[PodVanguard PTY] Inicializando canal TTY interactivo con ${selectedId.slice(0, 12)}...\r\n`);
    setIsConnected(false);

    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        setIsConnected(true);
        setOutput(prev => prev + `[PodVanguard PTY] Conexión establecida. Shell lista.\r\n\r\n`);
      };

      ws.onmessage = (e) => {
        if (typeof e.data === 'string') {
          setOutput(prev => prev + e.data);
        } else {
          const dec = new TextDecoder('utf-8');
          setOutput(prev => prev + dec.decode(e.data));
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setOutput(prev => prev + `\r\n[PodVanguard PTY] Sesión finalizada.\r\n`);
      };

      ws.onerror = () => {
        setIsConnected(false);
        setOutput(prev => prev + `\r\n[PodVanguard PTY] Error en el socket TTY.\r\n`);
      };

      wsRef.current = ws;
    } catch (err) {
      setOutput(prev => prev + `\r\n[PodVanguard PTY] Error: ${err.message}\r\n`);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!inputVal) return;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(inputVal + '\n');
      }

      setHistory(prev => [inputVal, ...prev]);
      setHistoryIdx(-1);
      setInputVal('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0 && historyIdx + 1 < history.length) {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setInputVal(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const prevIdx = historyIdx - 1;
        setHistoryIdx(prevIdx);
        setInputVal(history[prevIdx]);
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setInputVal('');
      }
    }
  };

  return (
    <div className="term-box">
      <div className="term-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: '#8E95A5', textTransform: 'uppercase' }}>
            Contenedor Destino:
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
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {runningContainers.length === 0 ? (
              <option value="">No hay contenedores en ejecución</option>
            ) : (
              runningContainers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.short_id})
                </option>
              ))
            )}
          </select>

          <span className="signal-pill">
            <span className={`led ${isConnected ? 'led-green' : 'led-red'}`} />
            <span>{isConnected ? 'TTY CONECTADO' : 'STANDBY'}</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="mech-btn mech-btn-primary mech-btn-sm" onClick={connectToContainer}>
            <Play size={12} />
            <span>{isConnected ? 'Reconectar Shell' : 'Conectar Shell'}</span>
          </button>
          <button className="mech-btn mech-btn-secondary mech-btn-sm" onClick={() => setOutput('')}>
            <Trash2 size={12} />
            <span>Limpiar Pantalla</span>
          </button>
        </div>
      </div>

      <div className="term-body" ref={outputRef}>
        {output || `PodVanguard Web Terminal Shell v0.1.0\r\nSelecciona un contenedor activo y pulsa 'Conectar Shell'.\r\nSoporta ejecución asíncrona interactiva en espacio de usuario.`}
      </div>

      <div className="term-input-row">
        <span className="term-prompt">pv-shell&gt;</span>
        <input
          type="text"
          className="term-input"
          placeholder={isConnected ? 'Escribe comando y pulsa Enter...' : 'Terminal en standby...'}
          disabled={!isConnected}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}
