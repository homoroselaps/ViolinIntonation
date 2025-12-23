/**
 * Audio Engine for Violin Intonation Mirror
 * 
 * Manages AudioContext lifecycle, device selection, routing, and worklet communication
 */

import {
  AudioConfig,
  DEFAULT_CONFIG,
  AudioEngineState,
  AnalysisResult,
  WorkletMessage,
  DebugInfo,
  AudioDevice,
} from './types';

// Worklet processor URL - served from public folder
// Use absolute path from root to ensure it works in all environments
const PROCESSOR_URL = new URL('/processor.js', window.location.origin).href;

export type AnalysisCallback = (result: AnalysisResult) => void;
export type DebugCallback = (debug: DebugInfo) => void;
export type StateCallback = (state: AudioEngineState) => void;
export type DeviceCallback = (devices: { inputs: AudioDevice[], outputs: AudioDevice[] }) => void;

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  
  private config: AudioConfig;
  private state: AudioEngineState;
  private selectedInputDeviceId: string | null = null;
  private lastLatencyMs: number = 0;
  
  private analysisCallbacks: Set<AnalysisCallback> = new Set();
  private debugCallbacks: Set<DebugCallback> = new Set();
  private stateCallbacks: Set<StateCallback> = new Set();
  private deviceCallbacks: Set<DeviceCallback> = new Set();
  
  constructor(initialConfig: Partial<AudioConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
    this.state = {
      isInitialized: false,
      isRunning: false,
      hasMicPermission: false,
      error: null,
      sampleRate: 0,
      latencyMs: 0,
    };
    
    // Listen for device changes
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        this.refreshDevices();
      });
    }
  }
  
  /**
   * Get current state
   */
  getState(): AudioEngineState {
    return { ...this.state };
  }
  
  /**
   * Get current config
   */
  getConfig(): AudioConfig {
    return { ...this.config };
  }
  
  /**
   * Subscribe to analysis results
   */
  onAnalysis(callback: AnalysisCallback): () => void {
    this.analysisCallbacks.add(callback);
    return () => this.analysisCallbacks.delete(callback);
  }
  
  /**
   * Subscribe to debug info
   */
  onDebug(callback: DebugCallback): () => void {
    this.debugCallbacks.add(callback);
    return () => this.debugCallbacks.delete(callback);
  }
  
  /**
   * Subscribe to state changes
   */
  onStateChange(callback: StateCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }
  
  /**
   * Subscribe to device list changes
   */
  onDeviceChange(callback: DeviceCallback): () => void {
    this.deviceCallbacks.add(callback);
    return () => this.deviceCallbacks.delete(callback);
  }
  
  /**
   * Refresh and notify device list
   */
  async refreshDevices(): Promise<void> {
    const devices = await this.getDevices();
    this.deviceCallbacks.forEach(cb => cb(devices));
  }
  
  /**
   * Get available audio devices
   */
  async getDevices(): Promise<{ inputs: AudioDevice[], outputs: AudioDevice[] }> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs: AudioDevice[] = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          kind: 'audioinput' as const,
        }));
      const outputs: AudioDevice[] = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${d.deviceId.slice(0, 8)}`,
          kind: 'audiooutput' as const,
        }));
      return { inputs, outputs };
    } catch {
      return { inputs: [], outputs: [] };
    }
  }
  
  /**
   * Get selected input device ID
   */
  getSelectedInputDeviceId(): string | null {
    return this.selectedInputDeviceId;
  }
  
  private updateState(partial: Partial<AudioEngineState>): void {
    this.state = { ...this.state, ...partial };
    this.stateCallbacks.forEach(cb => cb(this.state));
  }
  
  /**
   * Request microphone permission with low latency constraints
   */
  async requestMicPermission(): Promise<boolean> {
    try {
      // Request low latency audio capture
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: { ideal: 48000 },
        } as MediaTrackConstraints,
        video: false,
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Store stream for later use
      this.mediaStream = stream;
      this.updateState({ hasMicPermission: true, error: null });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Microphone access denied';
      this.updateState({ hasMicPermission: false, error: message });
      return false;
    }
  }
  
  /**
   * Initialize the audio engine
   */
  async initialize(): Promise<boolean> {
    if (this.state.isInitialized) {
      return true;
    }
    
    try {
      // Create AudioContext (must be after user gesture)
      this.audioContext = new AudioContext({
        latencyHint: 'interactive',
        sampleRate: 48000,
      });
      
      // Safari workaround: resume context
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Load worklet module
      await this.audioContext.audioWorklet.addModule(PROCESSOR_URL);
      
      // Create gain node for output control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.config.outputLevel;
      this.gainNode.connect(this.audioContext.destination);
      
      console.log('[AudioEngine] Initialized with sample rate:', this.audioContext.sampleRate);
      
      this.updateState({
        isInitialized: true,
        sampleRate: this.audioContext.sampleRate,
        error: null,
      });
      
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize audio';
      this.updateState({ isInitialized: false, error: message });
      return false;
    }
  }
  
  /**
   * Start audio processing
   */
  async start(): Promise<boolean> {
    if (this.state.isRunning) {
      return true;
    }
    
    if (!this.state.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }
    
    if (!this.state.hasMicPermission) {
      const hasPermission = await this.requestMicPermission();
      if (!hasPermission) return false;
    }
    
    if (!this.audioContext || !this.mediaStream || !this.gainNode) {
      this.updateState({ error: 'Audio context not ready' });
      return false;
    }
    
    try {
      // Ensure context is running
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Create source from mic stream
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Create worklet node
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        'intonation-mirror-processor',
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        }
      );
      
      // Handle messages from worklet
      this.workletNode.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
        this.handleWorkletMessage(event.data);
      };
      
      // Send initial config to worklet
      this.workletNode.port.postMessage({
        type: 'config',
        config: this.config,
      });
      
      // Connect nodes: mic -> worklet -> gain -> destination
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.gainNode);
      
      console.log('[AudioEngine] Audio routing connected: mic -> worklet -> gain -> destination');
      console.log('[AudioEngine] Gain value:', this.gainNode.gain.value);
      
      this.updateState({ isRunning: true, error: null });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start audio';
      this.updateState({ error: message });
      return false;
    }
  }
  
  /**
   * Stop audio processing
   */
  stop(): void {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    
    this.updateState({ isRunning: false });
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AudioConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update gain node
    if (this.gainNode && newConfig.outputLevel !== undefined) {
      this.gainNode.gain.setTargetAtTime(
        newConfig.outputLevel,
        this.audioContext?.currentTime ?? 0,
        0.02
      );
    }
    
    // Send config to worklet
    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'config',
        config: newConfig,
      });
    }
  }
  
  /**
   * Handle messages from worklet
   */
  private handleWorkletMessage(message: WorkletMessage): void {
    switch (message.type) {
      case 'analysis':
        // Update latency from worklet measurement
        if (message.data.latencyMs !== undefined && message.data.latencyMs !== this.lastLatencyMs) {
          this.lastLatencyMs = message.data.latencyMs;
          // Add browser's reported latencies
          const baseLatency = this.audioContext?.baseLatency 
            ? this.audioContext.baseLatency * 1000 
            : 10;
          const outputLatency = this.audioContext?.outputLatency 
            ? this.audioContext.outputLatency * 1000 
            : 10;
          const totalLatency = Math.round(message.data.latencyMs + baseLatency + outputLatency);
          if (totalLatency !== this.state.latencyMs) {
            this.updateState({ latencyMs: totalLatency });
            // Log latency breakdown for debugging
            console.log(`[Latency] Analysis: ${message.data.latencyMs.toFixed(1)}ms, Base: ${baseLatency.toFixed(1)}ms, Output: ${outputLatency.toFixed(1)}ms, Total: ${totalLatency}ms`);
          }
        }
        this.analysisCallbacks.forEach(cb => cb(message.data));
        break;
      
      case 'debug':
        this.debugCallbacks.forEach(cb => cb(message.data));
        break;
      
      case 'ready':
        console.log('AudioWorklet ready, sample rate:', message.sampleRate);
        break;
      
      case 'error':
        console.error('Worklet error:', message.message);
        this.updateState({ error: message.message });
        break;
    }
  }
  
  /**
   * Clean up and destroy engine
   */
  async destroy(): Promise<void> {
    this.stop();
    
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    
    this.updateState({
      isInitialized: false,
      isRunning: false,
      hasMicPermission: false,
      sampleRate: 0,
    });
  }
  
  /**
   * Get available audio input devices
   */
  async getInputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audioinput');
    } catch {
      return [];
    }
  }
  
  /**
   * Change input device
   */
  async setInputDevice(deviceId: string): Promise<boolean> {
    const wasRunning = this.state.isRunning;
    
    if (wasRunning) {
      this.stop();
    }
    
    // Stop old stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
      
      this.selectedInputDeviceId = deviceId;
      
      if (wasRunning) {
        return this.start();
      }
      
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set input device';
      this.updateState({ error: message });
      return false;
    }
  }
  
  /**
   * Set output device (where supported)
   */
  async setOutputDevice(deviceId: string): Promise<boolean> {
    try {
      // Check if setSinkId is supported
      if (this.audioContext && 'setSinkId' in this.audioContext) {
        await (this.audioContext as any).setSinkId(deviceId);
        return true;
      }
      // Fallback: not supported in all browsers
      console.warn('setSinkId not supported in this browser');
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set output device';
      this.updateState({ error: message });
      return false;
    }
  }
}

// Singleton instance
let engineInstance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!engineInstance) {
    engineInstance = new AudioEngine();
  }
  return engineInstance;
}

export function resetAudioEngine(): void {
  if (engineInstance) {
    engineInstance.destroy();
    engineInstance = null;
  }
}
