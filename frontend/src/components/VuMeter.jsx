// ==============================================================================
// PodVanguard - Banco de Vúmetros LED Segmentados (Hardware Telemetry VU-Meters)
// Autor: Ismael Sallami Moreno
//
// Renderiza vúmetros tanto en formato individual horizontal como en el banco
// de escalera vertical multihilo (8 núcleos de CPU) al estilo de un sintetizador
// de hardware Teenage Engineering.
// ==============================================================================

import React, { useState, useEffect } from 'react';

/**
 * Medidor horizontal estándar de 10 bloques LED.
 */
export function SingleVuMeter({ label, value, max = 100, unit = '%' }) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const segmentsCount = 10;
  const activeSegments = Math.round((pct / 100) * segmentsCount);

  return (
    <div className="vu-meter">
      <div className="vu-meta">
        <span className="vu-label">{label}</span>
        <span className="vu-val">{typeof value === 'number' ? value.toFixed(1) : value}{unit}</span>
      </div>
      <div className="vu-led-track">
        {Array.from({ length: segmentsCount }).map((_, idx) => {
          const isLit = idx < activeSegments;
          let litClass = '';
          if (isLit) {
            if (idx >= 8) litClass = 'lit-red';
            else if (idx >= 6) litClass = 'lit-orange';
            else if (idx >= 4) litClass = 'lit-amber';
            else litClass = 'lit-green';
          }
          return <div key={idx} className={`vu-segment ${litClass}`} />;
        })}
      </div>
    </div>
  );
}

/**
 * Banco vertical de 8 núcleos de CPU tipo escalera LED de hardware.
 */
export function MultiCoreVuBank({ overallCpu = 0 }) {
  // Simular actividad orgánica por núcleo con pequeñas variaciones sobre el CPU global
  const [coreLoads, setCoreLoads] = useState([20, 45, 70, 30, 50, 80, 40, 65]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCoreLoads((prev) =>
        prev.map((c, i) => {
          const jitter = (Math.sin(Date.now() / 800 + i * 1.5) * 18);
          const target = Math.max(8, Math.min(95, overallCpu + jitter));
          return Math.round(target);
        })
      );
    }, 400);
    return () => clearInterval(interval);
  }, [overallCpu]);

  const segmentsPerCore = 8;

  return (
    <div className="multicore-vu-bank">
      <div className="vu-bank-header">
        <span className="vu-bank-title">TELEMETRY VU-METERS</span>
        <span className="vu-bank-chip">8-CORE</span>
      </div>

      <div className="core-ladders-container">
        {coreLoads.map((load, coreIdx) => {
          const activeSegments = Math.round((load / 100) * segmentsPerCore);
          return (
            <div key={coreIdx} className="core-ladder-column">
              <div className="ladder-segments">
                {Array.from({ length: segmentsPerCore }).map((_, segIdx) => {
                  // Invertir índice para que crezca de abajo hacia arriba
                  const segmentPos = segmentsPerCore - 1 - segIdx;
                  const isLit = segmentPos < activeSegments;
                  let colorClass = 'seg-off';
                  if (isLit) {
                    if (segmentPos >= 6) colorClass = 'seg-orange';
                    else colorClass = 'seg-mint';
                  }
                  return <div key={segIdx} className={`ladder-seg ${colorClass}`} />;
                })}
              </div>
              <span className="core-index">0{coreIdx}</span>
            </div>
          );
        })}
      </div>

      <div className="vu-bank-footer">
        <span className="peak-readout">PEAK: +3.2 dB</span>
        <span className="status-readout">STATUS: OPTIMAL</span>
      </div>
    </div>
  );
}

export default SingleVuMeter;
