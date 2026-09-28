import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, Box, CircleDot, Terminal, FileText, 
  Network, ShieldAlert, Trash2, Layers, HardDrive, RefreshCw, Zap
} from 'lucide-react';

export default function CommandPalette({ isOpen, onClose, onSelectAction }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const actions = [
    { id: 'tab-overview', title: 'Ir al Panel General', category: 'Navegación', icon: LayoutDashboard, shortcut: 'G O' },
    { id: 'tab-containers', title: 'Ir a Contenedores Docker', category: 'Navegación', icon: Box, shortcut: 'G C' },
    { id: 'tab-pods', title: 'Ir a Kubernetes Pods', category: 'Navegación', icon: CircleDot, shortcut: 'G K' },
    { id: 'tab-terminal', title: 'Abrir Terminal Web PTY', category: 'Navegación', icon: Terminal, shortcut: 'G T' },
    { id: 'tab-logs', title: 'Ver Transmisión de Logs en Vivo', category: 'Navegación', icon: FileText, shortcut: 'G L' },
    { id: 'tab-topology', title: 'Abrir Topología de Red Interactiva', category: 'Navegación', icon: Network, shortcut: 'G N' },
    { id: 'tab-sentinel', title: 'Abrir Vanguard Sentinel Shield', category: 'Navegación', icon: ShieldAlert, shortcut: 'G S' },
    { id: 'tab-pruner', title: 'Abrir Motor de Poda de Disco', category: 'Navegación', icon: Trash2, shortcut: 'G P' },
    { id: 'tab-images', title: 'Ver Imágenes Locales', category: 'Navegación', icon: Layers, shortcut: 'G I' },
    { id: 'tab-volumes', title: 'Ver Volúmenes Persistentes', category: 'Navegación', icon: HardDrive, shortcut: 'G V' },
    { id: 'act-prune', title: 'Ejecutar Saneamiento de Disco Inmediato', category: 'Acciones', icon: Zap, shortcut: '⌘⇧P' },
    { id: 'act-refresh', title: 'Recargar Telemetría y Recursos', category: 'Acciones', icon: RefreshCw, shortcut: 'R' },
  ];

  const filtered = actions.filter(a => 
    a.title.toLowerCase().includes(query.toLowerCase()) || 
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % (filtered.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelectAction(filtered[selectedIndex].id);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose, onSelectAction]);

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div className="cmd-palette-modal" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="cmd-search-input"
          placeholder="Escribe una orden o salta a una sección... (ej: pods, logs, purga)"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
        />
        <div className="cmd-results-list">
          {filtered.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#525866' }}>
              No se encontraron coincidencias para "{query}"
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  className={`cmd-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectAction(item.id);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon size={16} color={isSelected ? '#FF5500' : '#8E95A5'} />
                    <span style={{ fontWeight: isSelected ? '700' : '500' }}>{item.title}</span>
                    <span style={{ fontSize: '10px', color: '#525866', marginLeft: '6px' }}>
                      [{item.category}]
                    </span>
                  </div>
                  <span className="cmd-shortcut">{item.shortcut}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
