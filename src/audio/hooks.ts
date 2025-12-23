/**
 * React hooks for audio engine integration
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AudioEngine, getAudioEngine } from './engine';
import { AudioConfig, AudioEngineState, AnalysisResult, DebugInfo } from './types';

/**
 * Hook to manage audio engine state and lifecycle
 */
export function useAudioEngine() {
  const engineRef = useRef<AudioEngine>(getAudioEngine());
  const [state, setState] = useState<AudioEngineState>(engineRef.current.getState());
  const [config, setConfig] = useState<AudioConfig>(engineRef.current.getConfig());
  
  useEffect(() => {
    const engine = engineRef.current;
    const unsubscribe = engine.onStateChange(setState);
    return unsubscribe;
  }, []);
  
  const initialize = useCallback(async () => {
    return engineRef.current.initialize();
  }, []);
  
  const requestMicPermission = useCallback(async () => {
    return engineRef.current.requestMicPermission();
  }, []);
  
  const start = useCallback(async () => {
    return engineRef.current.start();
  }, []);
  
  const stop = useCallback(() => {
    engineRef.current.stop();
  }, []);
  
  const updateConfig = useCallback((newConfig: Partial<AudioConfig>) => {
    engineRef.current.updateConfig(newConfig);
    setConfig(engineRef.current.getConfig());
  }, []);
  
  const getInputDevices = useCallback(async () => {
    return engineRef.current.getInputDevices();
  }, []);
  
  const setInputDevice = useCallback(async (deviceId: string) => {
    return engineRef.current.setInputDevice(deviceId);
  }, []);
  
  return {
    state,
    config,
    initialize,
    requestMicPermission,
    start,
    stop,
    updateConfig,
    getInputDevices,
    setInputDevice,
  };
}

/**
 * Hook to subscribe to analysis results
 */
export function useAnalysis() {
  const engineRef = useRef<AudioEngine>(getAudioEngine());
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  
  useEffect(() => {
    const unsubscribe = engineRef.current.onAnalysis(setAnalysis);
    return unsubscribe;
  }, []);
  
  return analysis;
}

/**
 * Hook to subscribe to debug info
 */
export function useDebugInfo() {
  const engineRef = useRef<AudioEngine>(getAudioEngine());
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  
  useEffect(() => {
    const unsubscribe = engineRef.current.onDebug(setDebug);
    return unsubscribe;
  }, []);
  
  return debug;
}

/**
 * Hook to track average pitch over time for visualization
 */
export function usePitchHistory(maxLength: number = 100) {
  const [history, setHistory] = useState<{ time: number; cents: number; frequency: number }[]>([]);
  const analysis = useAnalysis();
  
  useEffect(() => {
    if (analysis && analysis.pitches.length > 0 && analysis.gateOpen) {
      const pitch = analysis.pitches[0];
      setHistory(prev => {
        const newHistory = [...prev, {
          time: analysis.timestamp,
          cents: pitch.cents,
          frequency: pitch.frequency,
        }];
        if (newHistory.length > maxLength) {
          return newHistory.slice(-maxLength);
        }
        return newHistory;
      });
    }
  }, [analysis, maxLength]);
  
  const clear = useCallback(() => {
    setHistory([]);
  }, []);
  
  return { history, clear };
}
