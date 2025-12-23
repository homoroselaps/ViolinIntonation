/**
 * Pitch Display Component
 * Shows detected note name, frequency, and cent deviation
 */

import React from 'react';
import { AnalysisResult } from '../../audio/types';
import './PitchDisplay.css';

interface PitchDisplayProps {
  analysis: AnalysisResult | null;
  showReference?: boolean;
}

export const PitchDisplay: React.FC<PitchDisplayProps> = ({ 
  analysis, 
  showReference = true 
}) => {
  const pitch = analysis?.pitches[0];
  const isActive = analysis?.gateOpen && pitch;
  
  return (
    <div className={`pitch-display ${isActive ? 'active' : 'inactive'}`}>
      <div className="note-name">
        {isActive && pitch ? pitch.noteName : '—'}
      </div>
      
      <div className="frequency-display">
        <span className="detected-freq">
          {isActive && pitch ? `${pitch.frequency.toFixed(1)} Hz` : '— Hz'}
        </span>
        {showReference && isActive && pitch && (
          <span className="reference-freq">
            → {pitch.referenceFrequency.toFixed(1)} Hz
          </span>
        )}
      </div>
      
      <div className="confidence-bar">
        <div 
          className="confidence-fill"
          style={{ 
            width: `${(pitch?.confidence ?? 0) * 100}%`,
            opacity: isActive ? 1 : 0.3,
          }}
        />
      </div>
    </div>
  );
};
