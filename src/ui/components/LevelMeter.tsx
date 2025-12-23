/**
 * Level Meter Component
 * Shows input level with threshold indicator
 */

import React from 'react';
import { AnalysisResult } from '../../audio/types';
import './LevelMeter.css';

interface LevelMeterProps {
  analysis: AnalysisResult | null;
  threshold: number; // dB
}

export const LevelMeter: React.FC<LevelMeterProps> = ({ 
  analysis, 
  threshold 
}) => {
  const rmsDb = analysis?.rmsDb ?? -60;
  const gateOpen = analysis?.gateOpen ?? false;
  
  // Convert dB to percentage (assuming -60 to 0 range)
  const minDb = -60;
  const maxDb = 0;
  const percentage = Math.max(0, Math.min(100, ((rmsDb - minDb) / (maxDb - minDb)) * 100));
  const thresholdPosition = ((threshold - minDb) / (maxDb - minDb)) * 100;
  
  // Color based on level
  const getColor = () => {
    if (rmsDb > -6) return '#ff6b6b';
    if (rmsDb > -12) return '#f7d060';
    return '#4ecdc4';
  };
  
  return (
    <div className="level-meter">
      <div className="meter-label">Input Level</div>
      
      <div className="level-track">
        <div 
          className="level-fill"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: getColor(),
          }}
        />
        <div 
          className="threshold-marker"
          style={{ left: `${thresholdPosition}%` }}
          title={`Threshold: ${threshold} dB`}
        />
      </div>
      
      <div className="level-info">
        <span className="level-value">{rmsDb.toFixed(1)} dB</span>
        <span className={`gate-status ${gateOpen ? 'open' : 'closed'}`}>
          {gateOpen ? '● Active' : '○ Gated'}
        </span>
      </div>
    </div>
  );
};
