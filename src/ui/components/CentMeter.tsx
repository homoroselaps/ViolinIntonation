/**
 * Cent Meter Component
 * Visual representation of pitch deviation from reference
 */

import React, { useMemo } from 'react';
import { AnalysisResult } from '../../audio/types';
import './CentMeter.css';

interface CentMeterProps {
  analysis: AnalysisResult | null;
  range?: number; // cents range on each side
}

export const CentMeter: React.FC<CentMeterProps> = ({ 
  analysis, 
  range = 50 
}) => {
  const pitch = analysis?.pitches[0];
  const isActive = analysis?.gateOpen && pitch;
  const cents = pitch?.cents ?? 0;
  
  const { position, color } = useMemo(() => {
    // Clamp cents to range
    const clampedCents = Math.max(-range, Math.min(range, cents));
    // Convert to 0-100 position (50 = center)
    const pos = 50 + (clampedCents / range) * 50;
    
    // Color based on deviation
    const absCents = Math.abs(cents);
    let col: string;
    if (absCents < 5) {
      col = '#4ecdc4'; // Green - in tune
    } else if (absCents < 15) {
      col = '#f7d060'; // Yellow - slightly off
    } else {
      col = '#ff6b6b'; // Red - out of tune
    }
    
    return { position: pos, color: col };
  }, [cents, range]);
  
  // Generate tick marks
  const ticks = useMemo(() => {
    const result = [];
    for (let i = -range; i <= range; i += 10) {
      const pos = 50 + (i / range) * 50;
      const isMajor = i === 0 || Math.abs(i) === range || i % 25 === 0;
      result.push({ position: pos, label: i, isMajor });
    }
    return result;
  }, [range]);
  
  return (
    <div className={`cent-meter ${isActive ? 'active' : 'inactive'}`}>
      <div className="meter-label">Cents</div>
      
      <div className="meter-track">
        {/* Tick marks */}
        {ticks.map(tick => (
          <div
            key={tick.label}
            className={`tick ${tick.isMajor ? 'major' : 'minor'}`}
            style={{ left: `${tick.position}%` }}
          >
            {tick.isMajor && (
              <span className="tick-label">{tick.label > 0 ? `+${tick.label}` : tick.label}</span>
            )}
          </div>
        ))}
        
        {/* Center line */}
        <div className="center-line" />
        
        {/* Needle */}
        <div 
          className="needle"
          style={{ 
            left: `${position}%`,
            backgroundColor: color,
            opacity: isActive ? 1 : 0.3,
          }}
        />
      </div>
      
      <div className="cent-value" style={{ color: isActive ? color : '#666' }}>
        {isActive ? (
          cents >= 0 ? `+${cents.toFixed(1)}¢` : `${cents.toFixed(1)}¢`
        ) : '—'}
      </div>
    </div>
  );
};
