// ==============================================================================
// PodVanguard - Pantalla Osciloscopio de Topología de Red Vectorial (Vector Scope)
// Autor: Ismael Sallami Moreno
//
// Renderiza el grafo de conectividad y enrutamiento en un lienzo de estilo osciloscopio
// CRT con textura de scanlines, nodos interactivos arrastrables y lecturas de telemetría.
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Radio, ShieldCheck, Activity } from 'lucide-react';

export default function TopologyCanvas({ graph, onRefresh, isCompact = false }) {
  const containerRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [draggingNode, setDraggingNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState(null);

  // Inicializar posiciones de los nodos (con datos reales o mockup si está vacío)
  useEffect(() => {
    const width = isCompact ? 680 : 920;
    const height = isCompact ? 320 : 520;

    if (graph && graph.nodes && graph.nodes.length > 0) {
      const netNodes = graph.nodes.filter((n) => n.node_type === 'network');
      const cntNodes = graph.nodes.filter((n) => n.node_type === 'container');
      const portNodes = graph.nodes.filter((n) => n.node_type === 'port');
      const volNodes = graph.nodes.filter((n) => n.node_type === 'volume');

      const positioned = [];

      volNodes.forEach((n, i) => {
        const step = height / (volNodes.length + 1);
        positioned.push({ ...n, name: n.label || n.name || n.id || 'VOL', x: width * 0.12, y: step * (i + 1) });
      });

      netNodes.forEach((n, i) => {
        const step = height / (netNodes.length + 1);
        positioned.push({ ...n, name: n.label || n.name || n.id || 'NET', x: width * 0.35, y: step * (i + 1) });
      });

      cntNodes.forEach((n, i) => {
        const step = height / (cntNodes.length + 1);
        positioned.push({ ...n, name: n.label || n.name || n.id || 'POD', x: width * 0.65, y: step * (i + 1) });
      });

      portNodes.forEach((n, i) => {
        const step = height / (portNodes.length + 1);
        positioned.push({ ...n, name: n.label || n.name || n.id || 'PORT', x: width * 0.88, y: step * (i + 1) });
      });

      setNodes(positioned);
      setLinks(graph.links || []);
    } else {
      // Mockup de arquitectura de referencia (Teenage Engineering Hardware Mesh)
      const defaultNodes = [
        { id: 'ingress', name: 'INGRESS NODE_01', type: 'ingress', x: width * 0.15, y: height * 0.5, status: 'RUNNING' },
        { id: 'auth_api', name: 'AUTH API POD_04', type: 'service', x: width * 0.42, y: height * 0.28, status: 'RUNNING' },
        { id: 'redis_shard', name: 'REDIS SHARD POD_08', type: 'cache', x: width * 0.42, y: height * 0.72, status: 'RUNNING' },
        { id: 'postgres_db', name: 'POSTGRES DB_CORE', type: 'database', x: width * 0.70, y: height * 0.5, status: 'RUNNING' },
        { id: 'workers', name: 'WORKERS SCALE_8X', type: 'worker', x: width * 0.88, y: height * 0.5, status: 'RUNNING' },
      ];

      const defaultLinks = [
        { source: 'ingress', target: 'auth_api', link_type: 'network' },
        { source: 'ingress', target: 'redis_shard', link_type: 'network' },
        { source: 'auth_api', target: 'postgres_db', link_type: 'service' },
        { source: 'redis_shard', target: 'postgres_db', link_type: 'service' },
        { source: 'postgres_db', target: 'workers', link_type: 'worker' },
      ];

      setNodes(defaultNodes);
      setLinks(defaultLinks);
    }
  }, [graph, isCompact]);

  // Manejadores de arrastre con el puntero
  const handlePointerDown = (node, e) => {
    e.stopPropagation();
    setDraggingNode(node.id);
    setDragOffset({
      x: e.clientX - node.x,
      y: e.clientY - node.y,
    });
    setSelectedNode(node);
  };

  const handlePointerMove = (e) => {
    if (!draggingNode) return;
    const width = isCompact ? 680 : 920;
    const height = isCompact ? 320 : 520;

    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === draggingNode) {
          return {
            ...n,
            x: Math.max(40, Math.min(width - 40, e.clientX - dragOffset.x)),
            y: Math.max(30, Math.min(height - 30, e.clientY - dragOffset.y)),
          };
        }
        return n;
      })
    );
  };

  const handlePointerUp = () => {
    setDraggingNode(null);
  };

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const viewBoxWidth = isCompact ? 680 : 920;
  const viewBoxHeight = isCompact ? 320 : 520;

  return (
    <div
      className={`vector-scope-screen ${isCompact ? 'compact' : 'expanded'}`}
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Capa de scanlines CRT */}
      <div className="crt-scanlines" aria-hidden="true" />

      {/* Cabecera del Osciloscopio */}
      <div className="scope-header">
        <div className="scope-title-group">
          <Activity size={14} className="scope-icon text-orange" />
          <span className="scope-title">VECTOR NETWORK TOPOLOGY</span>
          <span className="scope-sub">SCOPE // MESH_NODES_ACTIVE</span>
        </div>
        <div className="scope-status-group">
          <span className="route-mode">
            ROUTE_MODE: <span className="text-mint">DIRECT</span> <span className="pulse-dot-mint" />
          </span>
          {onRefresh && (
            <button className="btn-scope-refresh" onClick={onRefresh} title="Actualizar topología">
              <RefreshCw size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Lienzo Vectorial SVG */}
      <svg className="scope-svg" viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}>
        <defs>
          <pattern id={`scope-grid-${isCompact ? 'c' : 'e'}`} width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(0, 229, 117, 0.05)" strokeWidth="0.75" />
          </pattern>
        </defs>

        <rect width={viewBoxWidth} height={viewBoxHeight} fill={`url(#scope-grid-${isCompact ? 'c' : 'e'})`} />

        {/* Líneas de enlace vectorial con pulsos de paquetes */}
        {links.map((link, idx) => {
          const src = nodeMap.get(link.source);
          const tgt = nodeMap.get(link.target);
          if (!src || !tgt) return null;

          let color = '#FF5500';
          let dash = '4,4';
          if (link.link_type === 'network') {
            color = '#FF9900';
            dash = '5,3';
          } else if (link.link_type === 'service' || link.link_type === 'port') {
            color = '#00E575';
            dash = 'none';
          } else if (link.link_type === 'worker') {
            color = '#00E575';
            dash = 'none';
          }

          const midX = (src.x + tgt.x) / 2;
          const pathD = `M ${src.x} ${src.y} C ${midX} ${src.y}, ${midX} ${tgt.y}, ${tgt.x} ${tgt.y}`;

          return (
            <g key={idx}>
              <path
                d={pathD}
                stroke={color}
                strokeWidth={1.8}
                strokeOpacity={0.7}
                strokeDasharray={dash}
                fill="none"
              />
              <circle r="3" fill={color}>
                <animateMotion path={pathD} dur="2.4s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}

        {/* Nodos de infraestructura con aspecto de circuito/chip */}
        {nodes.map((node) => {
          const isSelected = selectedNode?.id === node.id;
          const isDragging = draggingNode === node.id;
          const isOk = !node.status || node.status.toLowerCase() === 'running' || node.status === 'active';

          const strokeColor = isSelected ? '#FF5500' : isOk ? '#00E575' : '#FF2E4D';
          const nodeWidth = isCompact ? 105 : 125;
          const nodeHeight = isCompact ? 40 : 48;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x - nodeWidth / 2}, ${node.y - nodeHeight / 2})`}
              onPointerDown={(e) => handlePointerDown(node, e)}
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              {/* Caja del nodo */}
              <rect
                width={nodeWidth}
                height={nodeHeight}
                rx="2"
                fill="#161A22"
                stroke={strokeColor}
                strokeWidth={isSelected ? '2' : '1.25'}
                filter="drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.6))"
              />

              {/* Muesca técnica superior */}
              <rect x="4" y="2" width="6" height="2" fill={strokeColor} opacity="0.8" />
              <rect x={nodeWidth - 10} y="2" width="6" height="2" fill={strokeColor} opacity="0.8" />

              {/* Nombre del nodo */}
              {(() => {
                const displayName = String(node.name || node.label || node.id || 'NODE');
                return (
                  <text
                    x={nodeWidth / 2}
                    y={isCompact ? 18 : 22}
                    textAnchor="middle"
                    fill="#F4F1EA"
                    fontSize={isCompact ? '9px' : '10.5px'}
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="700"
                    letterSpacing="0.04em"
                  >
                    {displayName.length > 15 ? displayName.slice(0, 14) + '…' : displayName}
                  </text>
                );
              })()}

              {/* Sub-etiqueta de estado / tipo */}
              <text
                x={nodeWidth / 2}
                y={isCompact ? 30 : 36}
                textAnchor="middle"
                fill={strokeColor}
                fontSize={isCompact ? '8px' : '9px'}
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600"
              >
                {node.status || 'ACTIVE'}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Pie de Telemetría del Osciloscopio */}
      <div className="scope-footer">
        <div className="telemetry-readout">
          <span className="readout-tag">LATENCY:</span>
          <span className="readout-num text-orange">1.2 MS</span>
        </div>
        <div className="telemetry-readout">
          <span className="readout-tag">PACKET LOSS:</span>
          <span className="readout-num text-mint">0.00%</span>
        </div>
        <div className="telemetry-readout">
          <span className="readout-tag">BANDWIDTH:</span>
          <span className="readout-num text-mint">12.4 GB/S</span>
        </div>
        <div className="telemetry-readout">
          <span className="readout-tag">ENCRYPTION:</span>
          <span className="readout-num">AES-256</span>
        </div>
      </div>
    </div>
  );
}
