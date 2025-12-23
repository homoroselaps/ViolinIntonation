/**
 * Pitch Detection Utilities
 * Implements HPS (Harmonic Product Spectrum) and supporting algorithms
 */

import { NOTE_NAMES, MIN_FREQUENCY, MAX_FREQUENCY } from './types';

/**
 * Convert frequency to MIDI note number
 */
export function frequencyToMidi(frequency: number, a4: number = 440): number {
  return 69 + 12 * Math.log2(frequency / a4);
}

/**
 * Convert MIDI note number to frequency
 */
export function midiToFrequency(midi: number, a4: number = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Get note name from MIDI number
 */
export function midiToNoteName(midi: number): string {
  const noteIndex = Math.round(midi) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${NOTE_NAMES[noteIndex < 0 ? noteIndex + 12 : noteIndex]}${octave}`;
}

/**
 * Calculate cents deviation from nearest tempered pitch
 */
export function frequencyToCents(frequency: number, referenceFrequency: number): number {
  return 1200 * Math.log2(frequency / referenceFrequency);
}

/**
 * Get the nearest equal-tempered frequency
 */
export function nearestTemperedFrequency(frequency: number, a4: number = 440): number {
  const midi = frequencyToMidi(frequency, a4);
  const nearestMidi = Math.round(midi);
  return midiToFrequency(nearestMidi, a4);
}

/**
 * Check if frequency is within a scale
 */
export function isInScale(
  frequency: number,
  scaleRoot: number,
  scaleIntervals: number[],
  a4: number = 440
): boolean {
  const midi = Math.round(frequencyToMidi(frequency, a4));
  const noteClass = ((midi % 12) - scaleRoot + 12) % 12;
  return scaleIntervals.includes(noteClass);
}

/**
 * Snap frequency to nearest scale degree
 */
export function snapToScale(
  frequency: number,
  scaleRoot: number,
  scaleIntervals: number[],
  a4: number = 440
): number {
  const midi = frequencyToMidi(frequency, a4);
  const roundedMidi = Math.round(midi);
  const noteClass = ((roundedMidi % 12) - scaleRoot + 12) % 12;
  
  if (scaleIntervals.includes(noteClass)) {
    return midiToFrequency(roundedMidi, a4);
  }
  
  // Find nearest scale degree
  let minDistance = Infinity;
  let nearestInterval = 0;
  
  for (const interval of scaleIntervals) {
    const distance = Math.min(
      Math.abs(noteClass - interval),
      12 - Math.abs(noteClass - interval)
    );
    if (distance < minDistance) {
      minDistance = distance;
      nearestInterval = interval;
    }
  }
  
  const octave = Math.floor(roundedMidi / 12);
  const targetMidi = octave * 12 + scaleRoot + nearestInterval;
  
  return midiToFrequency(targetMidi, a4);
}

/**
 * Apply Hann window to a buffer
 */
export function applyHannWindow(buffer: Float32Array): Float32Array {
  const N = buffer.length;
  const windowed = new Float32Array(N);
  
  for (let i = 0; i < N; i++) {
    const multiplier = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    windowed[i] = buffer[i] * multiplier;
  }
  
  return windowed;
}

/**
 * Compute magnitude spectrum from complex FFT output
 */
export function computeMagnitudeSpectrum(
  real: Float32Array,
  imag: Float32Array
): Float32Array {
  const N = real.length;
  const magnitudes = new Float32Array(N / 2);
  
  for (let i = 0; i < N / 2; i++) {
    magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }
  
  return magnitudes;
}

/**
 * In-place Cooley-Tukey FFT
 */
export function fft(real: Float32Array, imag: Float32Array): void {
  const N = real.length;
  
  if (N <= 1) return;
  
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let k = N >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }
  
  // Cooley-Tukey iterative FFT
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    
    for (let i = 0; i < N; i += len) {
      let curReal = 1;
      let curImag = 0;
      
      for (let k = 0; k < halfLen; k++) {
        const evenIdx = i + k;
        const oddIdx = i + k + halfLen;
        
        const tReal = curReal * real[oddIdx] - curImag * imag[oddIdx];
        const tImag = curReal * imag[oddIdx] + curImag * real[oddIdx];
        
        real[oddIdx] = real[evenIdx] - tReal;
        imag[oddIdx] = imag[evenIdx] - tImag;
        real[evenIdx] = real[evenIdx] + tReal;
        imag[evenIdx] = imag[evenIdx] + tImag;
        
        const nextReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = nextReal;
      }
    }
  }
}

/**
 * Parabolic interpolation for peak refinement
 * Returns interpolated bin position
 */
export function parabolicInterpolation(
  magnitudes: Float32Array,
  peakBin: number
): number {
  if (peakBin <= 0 || peakBin >= magnitudes.length - 1) {
    return peakBin;
  }
  
  const alpha = magnitudes[peakBin - 1];
  const beta = magnitudes[peakBin];
  const gamma = magnitudes[peakBin + 1];
  
  const denominator = alpha - 2 * beta + gamma;
  if (Math.abs(denominator) < 1e-10) {
    return peakBin;
  }
  
  const p = 0.5 * (alpha - gamma) / denominator;
  return peakBin + p;
}

/**
 * Estimate noise floor using median of magnitudes in band
 */
export function estimateNoiseFloor(
  magnitudes: Float32Array,
  minBin: number,
  maxBin: number
): number {
  const values: number[] = [];
  
  for (let i = minBin; i < maxBin && i < magnitudes.length; i++) {
    values.push(magnitudes[i]);
  }
  
  if (values.length === 0) return 0;
  
  values.sort((a, b) => a - b);
  const medianIdx = Math.floor(values.length / 2);
  
  return values[medianIdx];
}

/**
 * Find local maxima (peaks) in magnitude spectrum
 */
export function findSpectralPeaks(
  magnitudes: Float32Array,
  sampleRate: number,
  minFreq: number = MIN_FREQUENCY,
  maxFreq: number = MAX_FREQUENCY,
  maxPeaks: number = 10,
  noiseMultiplier: number = 6
): { bin: number; frequency: number; magnitude: number }[] {
  const N = magnitudes.length * 2; // FFT size
  const binWidth = sampleRate / N;
  
  const minBin = Math.ceil(minFreq / binWidth);
  const maxBin = Math.min(Math.floor(maxFreq / binWidth), magnitudes.length - 1);
  
  const noiseFloor = estimateNoiseFloor(magnitudes, minBin, maxBin);
  const threshold = noiseFloor * noiseMultiplier;
  
  const peaks: { bin: number; frequency: number; magnitude: number }[] = [];
  
  for (let i = minBin + 1; i < maxBin - 1; i++) {
    const mag = magnitudes[i];
    
    // Local maximum check
    if (mag > magnitudes[i - 1] && mag > magnitudes[i + 1] && mag > threshold) {
      // Parabolic interpolation for better frequency estimate
      const refinedBin = parabolicInterpolation(magnitudes, i);
      const frequency = refinedBin * binWidth;
      
      peaks.push({ bin: i, frequency, magnitude: mag });
    }
  }
  
  // Sort by magnitude and return top peaks
  peaks.sort((a, b) => b.magnitude - a.magnitude);
  return peaks.slice(0, maxPeaks);
}

/**
 * Harmonic Product Spectrum (HPS) for fundamental frequency estimation
 */
export function harmonicProductSpectrum(
  magnitudes: Float32Array,
  sampleRate: number,
  harmonics: number = 4,
  minFreq: number = MIN_FREQUENCY,
  maxFreq: number = MAX_FREQUENCY
): { frequency: number; confidence: number; hpsBin: number } {
  const N = magnitudes.length * 2;
  const binWidth = sampleRate / N;
  
  const minBin = Math.ceil(minFreq / binWidth);
  const maxBin = Math.min(Math.floor(maxFreq / binWidth), magnitudes.length / harmonics);
  
  if (maxBin <= minBin) {
    return { frequency: 0, confidence: 0, hpsBin: 0 };
  }
  
  // Create HPS array
  const hps = new Float32Array(maxBin);
  
  for (let i = minBin; i < maxBin; i++) {
    let product = magnitudes[i];
    
    for (let h = 2; h <= harmonics; h++) {
      const hBin = i * h;
      if (hBin < magnitudes.length) {
        product *= magnitudes[hBin];
      }
    }
    
    hps[i] = product;
  }
  
  // Find maximum in HPS
  let maxVal = 0;
  let maxBinIdx = minBin;
  
  for (let i = minBin; i < maxBin; i++) {
    if (hps[i] > maxVal) {
      maxVal = hps[i];
      maxBinIdx = i;
    }
  }
  
  // Refine with parabolic interpolation on original magnitude
  const refinedBin = parabolicInterpolation(magnitudes, maxBinIdx);
  const frequency = refinedBin * binWidth;
  
  // Calculate confidence as ratio of max to median
  const medianHps = estimateNoiseFloor(hps, minBin, maxBin);
  const confidence = medianHps > 0 ? Math.min(1, maxVal / (medianHps * 100)) : 0;
  
  return { frequency, confidence, hpsBin: maxBinIdx };
}

/**
 * Calculate RMS of a buffer
 */
export function calculateRms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * Convert linear amplitude to dB
 */
export function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(linear, 1e-10));
}

/**
 * Convert dB to linear amplitude
 */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Exponential moving average
 */
export function ema(current: number, previous: number, alpha: number): number {
  return alpha * current + (1 - alpha) * previous;
}
