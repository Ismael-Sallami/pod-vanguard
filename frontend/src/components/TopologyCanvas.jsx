import React, { useState, useEffect, useRef } from 'react';
import { Network, Box, HardDrive, Globe, RefreshCw } from 'lucide-react';

export default function TopologyCanvas({ graph, onRefresh }) {
  const containerRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [draggingNode, setDraggingNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState(null);

  // Inicializar posiciones calculadas de los nodos
  useEffect(() => {
    if (!graph || !graph.nodes) return;

    const width = 900;
    const height = 540;

    const netNodes = graph.nodes.filter(n => n.node_type === 'network');
    const cntNodes = graph.nodes.filter(n => n.node_type === 'container');
    const portNodes = graph.nodes.filter(n => n.node_type === 'port');
    const volNodes = graph.nodes.filter(n => n.node_type === 'volume');

    const positioned = [];

    // Redes en el tercio medio izquierdo
    netNodes.forEach((n, i) => {
      const step = height / (netNodes.length + 1);
      positioned.push({ ...n, x: width * 0.35, y: step * (i + 1) });
    });

    // Contenedores en el tercio medio derecho
    cntNodes.forEach((n, i) => {
      const step = height / (cntNodes.length + 1);
      positioned.push({ ...n, x: width * 0.65, y: step * (i + 1) });
    });

    // Puertos en el extremo derecho
    portNodes.forEach((n, i) => {
      const step = height / (portNodes.length + 1);
      positioned.push({ ...n, x: width * 0.88, y: step * (i + 1) });
    });

    // Volúmenes en el extremo izquierdo
    volNodes.forEach((n, i) => {
      const step = height / (volNodes.length + 1);
      positioned.push({ ...n, x: width * 0.12, y: step * (i + 1) });
    });

    setNodes(positioned);
    setLinks(graph.links || []);
  }, [graph]);

  // Manejo de arrastre de nodos (Drag & Drop en Canvas)
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
    setNodes(prev => prev.map(n => {
      if (n.id === draggingNode) {
        return {
          ...n,
          x: Math.max(30, Math.min(870, e.clientX - dragOffset.x)),
          y: Math.max(30, Math.min(510, e.clientY - dragOffset.y)),
        };
      }
      return n;
    }));
  };

  const handlePointerUp = () => {
    setDraggingNode(null);
  };

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  return (
    <div 
      className="topology-stage"
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div style={{
        position: 'absolute',
        top: 14,
        left: 18,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 10
      }}>
        <span className="signal-pill">
          <span className="led led-orange" />
          <span>ESQUEMÁTICO DE ENLACE DE DATOS (CAD)</span>
        </span>
        <span style={{ fontSize: '11px', color: '#525866', fontFamily: 'JetBrains Mono' }}>
          Arrastra los nodos libremente para reconfigurar la vista
        </span>
      </div>

      <div style={{ position: 'absolute', top: 14, right: 18, zIndex: 10 }}>
        <button className="mech-btn mech-btn-secondary mech-btn-sm" onClick={onRefresh}>
          <RefreshCw size={12} />
          <span>Recalcular Grafo</span>
        </button>
      </div>

      <svg className="topology-svg" viewBox="0 0 900 540">
        <defs>
          <pattern id="cad-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width="900" height="540" fill="url(#cad-grid)" />

        {/* Enlaces de comunicación */}
        {links.map((link, idx) => {
          const src = nodeMap.get(link.source);
          const tgt = nodeMap.get(link.target);
          if (!src || !tgt) return null;

          let color = '#FF5500';
          let dash = '4,4';
          if (link.link_type === 'network') {
            color = '#00C2FF';
            dash = '5,3';
          } else if (link.link_type === 'port') {
            color = '#00E575';
            dash = 'none';
          } else if (link.link_type === 'volume') {
            color = '#FFB000';
            dash = '2,4';
          }

          const midX = (src.x + tgt.x) / 2;
          const pathD = `M ${src.x} ${src.y} C ${midX} ${src.y}, ${midX} ${tgt.y}, ${tgt.x} ${tgt.y}`;

          return (
            <g key={idx}>
              <path
                d={pathD}
                stroke={color}
                strokeWidth={1.75}
                strokeOpacity={0.65}
                strokeDasharray={dash}
                fill="none"
              />
              <circle r="3" fill={color}>
                <animateMotion path={pathD} dur="3s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}

        {/* Nodos de infraestructura */}
        {nodes.map(node => {
          const isSelected = selectedNode?.id === node.id;
          const isRunning = node.status.toLowerCase() === 'running' || node.status === 'active';

          let strokeColor = '#2A3142';
          let fillColor = '#0E1117';
          let iconColor = '#8E95A5';

          if (node.node_type === 'network') {
            strokeColor = '#00C2FF';
            fillColor = 'rgba(0, 194, 255, 0.1)';
            iconColor = '#00C2FF';
          } else if (node.node_type === 'container') {
            strokeColor = isRunning ? '#00E575' : '#FF2E4D';
            fillColor = isRunning ? 'rgba(0, 229, 117, 0.1)' : 'rgba(255, 46, 77, 0.1)';
            iconColor = isRunning ? '#00E575' : '#FF2E4D';
          } else if (node.node_type === 'port') {
            strokeColor = '#00E575';
            fillColor = 'rgba(0, 229, 117, 0.08)';
            iconColor = '#00E575';
          } else if (node.node_type === 'volume') {
            strokeColor = '#FFB000';
            fillColor = 'rgba(255, 176, 0, 0.08)';
            iconColor = '#FFB000';
          }

          if (isSelected) {
            strokeColor = '#FF5500';
          }

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onPointerDown={(e) => handlePointerDown(node, e)}
              style={{ cursor: 'grab' }}
            >
              <rect
                x="-40"
                y="-20"
                width="80"
                height="40"
                rx="4"
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isSelected ? 2 : 1.5}
              />
              <text
                x="0"
                y="3"
                textAnchor="middle"
                fill="#EDEDED"
                fontSize="11"
                fontWeight="700"
                fontFamily="Archivo, sans-serif"
                pointerEvents="none"
              >
                {node.label.length > 10 ? node.label.slice(0, 9) + '…' : node.label}
              </text>
              <text
                x="0"
                y="15"
                textAnchor="middle"
                fill={iconColor}
                fontSize="8"
                fontWeight="700"
                fontFamily="JetBrains Mono, monospace"
                textTransform="uppercase"
                pointerEvents="none"
              >
                {node.node_type}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Panel flotante de detalle de nodo seleccionado */}
      {selectedNode && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 18,
          backgroundColor: '#0E1117',
          border: '1px solid #2A3142',
          borderLeft: '4px solid #FF5500',
          borderRadius: 4,
          padding: '12px 16px',
          maxWidth: 380,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          zIndex: 20
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <strong style={{ fontSize: '13px', color: '#EDEDED' }}>{selectedNode.label}</strong>
            <span style={{
              fontSize: '10px',
              fontFamily: 'JetBrains Mono',
              color: '#FF5500',
              textTransform: 'uppercase'
            }}>
              [{selectedNode.node_type}]
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#8E95A5', fontFamily: 'JetBrains Mono' }}>
            {selectedNode.details || 'Sin especificaciones adicionales'}
          </div>
        </div>
      )}
    </div>
  );
}
