/**
 * Main App Component
 * Violin Intonation Mirror
 */

import React, { useState, useCallback } from 'react';
import { useAudioEngine, useAnalysis, useDebugInfo } from './audio/hooks';
import { SCALES } from './audio/types';
import {
  PitchDisplay,
  CentMeter,
  LevelMeter,
  ControlPanel,
  DebugPanel,
} from './ui/components';
import './App.css';

const App: React.FC = () => {
  const { state, config, start, stop, updateConfig } = useAudioEngine();
  const analysis = useAnalysis();
  const debug = useDebugInfo();
  
  const [showDebug, setShowDebug] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  
  const handleToggle = useCallback(async () => {
    if (state.isRunning) {
      stop();
    } else {
      setIsStarting(true);
      try {
        await start();
      } finally {
        setIsStarting(false);
      }
    }
  }, [state.isRunning, start, stop]);
  
  // Initialize scale config if needed
  const handleConfigChange = useCallback((newConfig: Parameters<typeof updateConfig>[0]) => {
    // If switching to scale mode and no scale set, use major scale on C
    if (newConfig.referenceMode === 'scale' && !config.scale) {
      updateConfig({
        ...newConfig,
        scale: { ...SCALES.major, root: 0 },
      });
    } else {
      updateConfig(newConfig);
    }
  }, [config.scale, updateConfig]);
  
  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <img src="/violin.svg" alt="Violin" className="logo-icon" />
          <h1>Violin Intonation Mirror</h1>
        </div>
        <p className="tagline">Real-time pitch detection with synthesized reference tones</p>
      </header>
      
      <main className="app-main">
        {/* Start/Stop Button */}
        <div className="start-section">
          <button
            className={`start-button ${state.isRunning ? 'running' : ''}`}
            onClick={handleToggle}
            disabled={isStarting}
          >
            {isStarting ? (
              'Starting...'
            ) : state.isRunning ? (
              <>
                <span className="pulse-dot" />
                Stop
              </>
            ) : (
              'Enable Microphone & Start'
            )}
          </button>
          
          {state.error && (
            <div className="error-message">
              ⚠️ {state.error}
            </div>
          )}
          
          {!state.hasMicPermission && !state.error && (
            <p className="permission-note">
              Click to grant microphone access. Audio is processed locally in your browser.
            </p>
          )}
        </div>
        
        {/* Main Display */}
        <div className="display-section">
          <PitchDisplay 
            analysis={analysis} 
            showReference={config.referenceMode !== 'mirror'} 
          />
          
          <CentMeter analysis={analysis} range={50} />
          
          <LevelMeter 
            analysis={analysis} 
            threshold={config.inputThreshold} 
          />
        </div>
        
        {/* Controls */}
        <div className="controls-section">
          <ControlPanel
            config={config}
            onConfigChange={handleConfigChange}
            disabled={!state.isRunning}
          />
        </div>
        
        {/* Debug Panel */}
        <DebugPanel
          analysis={analysis}
          debug={debug}
          state={state}
          visible={showDebug}
          onToggle={() => setShowDebug(!showDebug)}
        />
      </main>
      
      <footer className="app-footer">
        <p>
          For violin practice. No audio is uploaded.
          <span className="separator">•</span>
          {state.sampleRate > 0 && (
            <span className="sample-rate">{state.sampleRate} Hz</span>
          )}
        </p>
      </footer>
    </div>
  );
};

export default App;
