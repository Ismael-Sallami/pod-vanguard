import React from 'react';

/**
 * Medidor VU segmentado en 10 bloques LED tipo hardware físico / rack analógico.
 * Estilo Teenage Engineering con transición rápida entre segmentos.
 */
export default function VuMeter({ label, value, max = 100, unit = '%' }) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const segmentsCount = 10;
  const activeSegments = Math.round((pct / 100) * segmentsCount);

  return (
    <div className="vu-meter">
      <div className="vu-meta">
        <span className="vu-label">{label}</span>
        <span className="vu-val">{value.toFixed(1)}{unit}</span>
      </div>
      <div className="vu-led-track">
        {Array.from({ length: segmentsCount }).map((_, idx) => {
          const isLit = idx < activeSegments;
          let litClass = '';
          if (isLit) {
            if (idx >= 8) {
              litClass = 'lit-red';
            } else if (idx >= 6) {
              litClass = 'lit-orange';
            } else if (idx >= 4) {
              litClass = 'lit-amber';
            } else {
              litClass = 'lit-green';
            }
          }
          return <div key={idx} className={`vu-segment ${litClass}`} />;
        })}
      </div>
    </div>
  );
}
