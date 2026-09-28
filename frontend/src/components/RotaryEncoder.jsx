// ==============================================================================
// PodVanguard - Componente de Potenciómetro Rotatorio (Rotary Parameter Encoder)
// Autor: Ismael Sallami Moreno
//
// Simula un mando rotatorio analógico con muesca reflectante en Safety Orange.
// Permite ajuste táctil mediante arrastre vertical con el puntero o rueda del ratón.
// ==============================================================================

import React, { useState, useRef, useEffect } from 'react';

export default function RotaryEncoder({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange,
  subLabel = ''
}) {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startValRef = useRef(value);

  // Calcular el ángulo de rotación entre -135deg y +135deg (rango de 270 grados estándar de potenciómetro)
  const percentage = Math.min(Math.max((value - min) / (max - min), 0), 1);
  const angle = -135 + percentage * 270;

  const handlePointerDown = (e) => {
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValRef.current = value;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const deltaY = startYRef.current - e.clientY; // Arriba incrementa, abajo decrementa
    const range = max - min;
    const valuePerPixel = range / 150; // Sensibilidad de 150px para recorrido completo
    let newVal = startValRef.current + deltaY * valuePerPixel;
    newVal = Math.round(newVal / step) * step;
    newVal = Math.min(Math.max(newVal, min), max);

    if (newVal !== value && onChange) {
      onChange(newVal);
    }
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? step : -step;
    let newVal = Math.min(Math.max(value + dir, min), max);
    if (newVal !== value && onChange) {
      onChange(newVal);
    }
  };

  return (
    <div className="rotary-encoder-container">
      <div className="encoder-label">{label}</div>
      <div
        className={`rotary-dial ${isDragging ? 'dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        title="Arrastra verticalmente o usa la rueda para ajustar"
      >
        <div className="dial-cap">
          <div
            className="dial-pointer"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            <div className="dial-notch"></div>
          </div>
        </div>
      </div>
      <div className="encoder-readout">
        <span className="readout-val">
          {typeof value === 'number' && value < 10 && value >= 0 ? `0${value}` : value}
        </span>
        {unit && <span className="readout-unit"> {unit}</span>}
      </div>
      {subLabel && <div className="encoder-sub">{subLabel}</div>}
    </div>
  );
}
