/**
 * Audio Types and Interfaces for Violin Intonation Mirror
 */

// ============================================================================
// Configuration Types
// ============================================================================

export type ReferenceMode = 'mirror' | 'quantize' | 'scale';
export type WaveformType = 'sine' | 'triangle' | 'sawtooth';

export interface ScaleConfig {
  root: number; // 0-11 (C=0, C#=1, etc.)
  intervals: number[]; // semitone intervals from root
  name: string;
}

export interface AudioConfig {
  // Reference settings
  referenceMode: ReferenceMode;
  a4Tuning: number; // 415-445 Hz
  
  // Synthesis
  waveformType: WaveformType;
  pitchCount: 1 | 2 | 3;
  outputLevel: number; // 0-1
  
  // Analysis
  stabilitySmoothing: number; // 0-1 (alpha for EMA)
  
  // Gate
  inputThreshold: number; // dB
  confidenceThreshold: number; // 0-1
  attackTime: number; // ms
  releaseTime: number; // ms
  
  // Scale mode
  scale?: ScaleConfig;
  
  // Debug
  enableMicMonitoring: boolean;
}

export const DEFAULT_CONFIG: AudioConfig = {
  referenceMode: 'quantize',
  a4Tuning: 440,
  waveformType: 'sine',
  pitchCount: 1,
  outputLevel: 0.5,
  stabilitySmoothing: 0.7,
  inputThreshold: -70, // dB - lower for quiet inputs
  confidenceThreshold: 0.15,
  attackTime: 10,
  releaseTime: 80,
  enableMicMonitoring: false,
};

// ============================================================================
// Analysis Result Types
// ============================================================================

export interface DetectedPitch {
  frequency: number;
  confidence: number;
  midiNote: number;
  noteName: string;
  cents: number; // deviation from nearest tempered pitch
  referenceFrequency: number; // the tempered pitch frequency
}

export interface AnalysisResult {
  pitches: DetectedPitch[];
  rmsLevel: number; // 0-1
  rmsDb: number; // dB
  gateOpen: boolean;
  timestamp: number;
}

export interface SpectralPeak {
  bin: number;
  frequency: number;
  magnitude: number;
}

// ============================================================================
// Worklet Message Types
// ============================================================================

export type WorkletMessageType = 
  | 'config'
  | 'analysis'
  | 'debug'
  | 'ready'
  | 'error';

export interface WorkletConfigMessage {
  type: 'config';
  config: Partial<AudioConfig>;
}

export interface WorkletAnalysisMessage {
  type: 'analysis';
  data: AnalysisResult;
}

export interface WorkletDebugMessage {
  type: 'debug';
  data: DebugInfo;
}

export interface WorkletReadyMessage {
  type: 'ready';
  sampleRate: number;
}

export interface WorkletErrorMessage {
  type: 'error';
  message: string;
}

export type WorkletMessage = 
  | WorkletConfigMessage
  | WorkletAnalysisMessage
  | WorkletDebugMessage
  | WorkletReadyMessage
  | WorkletErrorMessage;

// ============================================================================
// Debug Types
// ============================================================================

export interface DebugInfo {
  hopCount: number;
  cpuUsage: number;
  droppedFrames: number;
  bufferHealth: number;
  topPeaks: SpectralPeak[];
  noiseFloor: number;
  hpsMaxBin: number;
  estimatedLatencyMs: number;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface AudioEngineState {
  isInitialized: boolean;
  isRunning: boolean;
  hasMicPermission: boolean;
  error: string | null;
  sampleRate: number;
}

// ============================================================================
// Music Theory Constants
// ============================================================================

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export const SCALES: Record<string, ScaleConfig> = {
  major: { root: 0, intervals: [0, 2, 4, 5, 7, 9, 11], name: 'Major' },
  minor: { root: 0, intervals: [0, 2, 3, 5, 7, 8, 10], name: 'Natural Minor' },
  harmonicMinor: { root: 0, intervals: [0, 2, 3, 5, 7, 8, 11], name: 'Harmonic Minor' },
  melodicMinor: { root: 0, intervals: [0, 2, 3, 5, 7, 9, 11], name: 'Melodic Minor' },
  pentatonic: { root: 0, intervals: [0, 2, 4, 7, 9], name: 'Pentatonic' },
  chromatic: { root: 0, intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], name: 'Chromatic' },
};

// Violin open strings (standard tuning)
export const VIOLIN_OPEN_STRINGS = {
  G3: 196.0,
  D4: 293.66,
  A4: 440.0,
  E5: 659.25,
};

// DSP Constants
export const FFT_SIZE = 4096;
export const HOP_SIZE = 512;
export const MIN_FREQUENCY = 50;
export const MAX_FREQUENCY = 6000;
export const VIOLIN_MIN_FREQ = 196; // G3
export const VIOLIN_MAX_FREQ = 3136; // E7 (highest practical)
