/**
 * Debug Panel Component
 * Shows technical information for troubleshooting
 */

import React from 'react';
import { AnalysisResult, DebugInfo, AudioEngineState } from '../../audio/types';
import './DebugPanel.css';

interface DebugPanelProps {
  analysis: AnalysisResult | null;
  debug: DebugInfo | null;
  state: AudioEngineState;
  visible: boolean;
  onToggle: () => void;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  analysis,
  debug,
  state,
  visible,
  onToggle,
}) => {
  return (
    <div className="debug-panel-container">
      <button className="debug-toggle" onClick={onToggle}>
        {visible ? '▼ Hide Debug' : '▶ Show Debug'}
      </button>
      
      {visible && (
        <div className="debug-panel">
          <div className="debug-section">
            <h4>Engine State</h4>
            <div className="debug-grid">
              <span>Initialized:</span>
              <span className={state.isInitialized ? 'ok' : 'warn'}>
                {state.isInitialized ? 'Yes' : 'No'}
              </span>
              <span>Running:</span>
              <span className={state.isRunning ? 'ok' : 'warn'}>
                {state.isRunning ? 'Yes' : 'No'}
              </span>
              <span>Mic Permission:</span>
              <span className={state.hasMicPermission ? 'ok' : 'warn'}>
                {state.hasMicPermission ? 'Yes' : 'No'}
              </span>
              <span>Sample Rate:</span>
              <span>{state.sampleRate} Hz</span>
              <span>Error:</span>
              <span className={state.error ? 'error' : ''}>
                {state.error ?? 'None'}
              </span>
            </div>
          </div>
          
          {analysis && (
            <div className="debug-section">
              <h4>Analysis</h4>
              <div className="debug-grid">
                <span>RMS Level:</span>
                <span>{analysis.rmsLevel.toFixed(4)}</span>
                <span>RMS (dB):</span>
                <span>{analysis.rmsDb.toFixed(1)} dB</span>
                <span>Gate Open:</span>
                <span className={analysis.gateOpen ? 'ok' : ''}>
                  {analysis.gateOpen ? 'Yes' : 'No'}
                </span>
                <span>Pitches:</span>
                <span>{analysis.pitches.length}</span>
              </div>
              
              {analysis.pitches.length > 0 && (
                <div className="pitch-details">
                  <h5>Detected Pitches</h5>
                  {analysis.pitches.map((p, i) => (
                    <div key={i} className="pitch-row">
                      <span>{p.noteName}</span>
                      <span>{p.frequency.toFixed(2)} Hz</span>
                      <span>{p.cents >= 0 ? '+' : ''}{p.cents.toFixed(1)}¢</span>
                      <span>conf: {(p.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {debug && (
            <div className="debug-section">
              <h4>Performance</h4>
              <div className="debug-grid">
                <span>Hop Count:</span>
                <span>{debug.hopCount}</span>
                <span>CPU Usage:</span>
                <span>{(debug.cpuUsage * 100).toFixed(1)}%</span>
                <span>Dropped Frames:</span>
                <span className={debug.droppedFrames > 0 ? 'warn' : ''}>
                  {debug.droppedFrames}
                </span>
                <span>Buffer Health:</span>
                <span>{(debug.bufferHealth * 100).toFixed(0)}%</span>
                <span>Estimated Latency:</span>
                <span>{debug.estimatedLatencyMs.toFixed(1)} ms</span>
              </div>
              
              {debug.topPeaks.length > 0 && (
                <div className="peaks-list">
                  <h5>Top Spectral Peaks</h5>
                  {debug.topPeaks.slice(0, 5).map((peak, i) => (
                    <div key={i} className="peak-row">
                      <span>#{i + 1}</span>
                      <span>{peak.frequency.toFixed(1)} Hz</span>
                      <span>{peak.magnitude.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
