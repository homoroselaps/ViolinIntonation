/**
 * React hooks for audio engine integration
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AudioEngine, getAudioEngine } from './engine';
import { AudioConfig, AudioEngineState, AnalysisResult, DebugInfo, AudioDevice, PitchHistoryPoint } from './types';

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
  
  const setInputDevice = useCallback(async (deviceId: string) => {
    return engineRef.current.setInputDevice(deviceId);
  }, []);
  
  const setOutputDevice = useCallback(async (deviceId: string) => {
    return engineRef.current.setOutputDevice(deviceId);
  }, []);
  
  return {
    state,
    config,
    initialize,
    requestMicPermission,
    start,
    stop,
    updateConfig,
    setInputDevice,
    setOutputDevice,
  };
}

/**
 * Hook to manage audio devices
 */
export function useAudioDevices() {
  const engineRef = useRef<AudioEngine>(getAudioEngine());
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  
  const refreshDevices = useCallback(async () => {
    const devices = await engineRef.current.getDevices();
    setInputDevices(devices.inputs);
    setOutputDevices(devices.outputs);
    
    // Set default selection if not set
    if (!selectedInputId && devices.inputs.length > 0) {
      setSelectedInputId(devices.inputs[0].deviceId);
    }
    if (!selectedOutputId && devices.outputs.length > 0) {
      setSelectedOutputId(devices.outputs[0].deviceId);
    }
  }, [selectedInputId, selectedOutputId]);
  
  useEffect(() => {
    // Initial device enumeration
    refreshDevices();
    
    // Subscribe to device changes
    const unsubscribe = engineRef.current.onDeviceChange((devices) => {
      setInputDevices(devices.inputs);
      setOutputDevices(devices.outputs);
    });
    
    return unsubscribe;
  }, [refreshDevices]);
  
  const selectInput = useCallback(async (deviceId: string) => {
    const success = await engineRef.current.setInputDevice(deviceId);
    if (success) {
      setSelectedInputId(deviceId);
    }
    return success;
  }, []);
  
  const selectOutput = useCallback(async (deviceId: string) => {
    const success = await engineRef.current.setOutputDevice(deviceId);
    if (success) {
      setSelectedOutputId(deviceId);
    }
    return success;
  }, []);
  
  return {
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    selectInput,
    selectOutput,
    refreshDevices,
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
export function usePitchHistory(maxLength: number = 200) {
  const [history, setHistory] = useState<PitchHistoryPoint[]>([]);
  const analysis = useAnalysis();
  
  useEffect(() => {
    if (analysis && analysis.pitches.length > 0 && analysis.gateOpen) {
      const pitch = analysis.pitches[0];
      const point: PitchHistoryPoint = {
        timestamp: analysis.timestamp,
        frequency: pitch.frequency,
        cents: pitch.cents,
        confidence: pitch.confidence,
        noteName: pitch.noteName,
      };
      
      setHistory(prev => {
        const newHistory = [...prev, point];
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
