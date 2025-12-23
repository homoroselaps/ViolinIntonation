/**
 * Audio Worklet Processor for Violin Intonation Mirror
 * 
 * This file runs in the AudioWorklet context and handles:
 * - Ring buffer for incoming audio samples
 * - YIN pitch detection algorithm (better for complex tones)
 * - Synthesis oscillator bank
 * - Envelope/gate control
 * - Latency measurement
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// DSP Constants - optimized for low latency
const BUFFER_SIZE = 1024;      // Reduced from 2048 for lower latency (~21ms at 48kHz)
const HOP_SIZE = 128;          // Smaller hop for faster updates
const MIN_FREQUENCY = 150;     // Raised minimum (violin G3=196Hz) for smaller buffer
const MAX_FREQUENCY = 2000;    // Above violin E6 (~1319Hz)
const YIN_THRESHOLD = 0.15;    // YIN confidence threshold

/**
 * Ring Buffer for accumulating samples for analysis
 */
class RingBuffer {
  constructor(size) {
    this.buffer = new Float32Array(size);
    this.writeIndex = 0;
    this.available = 0;
  }
  
  write(data) {
    for (let i = 0; i < data.length; i++) {
      this.buffer[this.writeIndex] = data[i];
      this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
      if (this.available < this.buffer.length) {
        this.available++;
      }
    }
  }
  
  read(output) {
    if (this.available < output.length) {
      return false;
    }
    
    for (let i = 0; i < output.length; i++) {
      const idx = (this.writeIndex - output.length + i + this.buffer.length) % this.buffer.length;
      output[i] = this.buffer[idx];
    }
    
    return true;
  }
  
  getAvailable() {
    return this.available;
  }
}

/**
 * YIN Pitch Detection Algorithm
 * Based on "YIN, a fundamental frequency estimator for speech and music"
 * by Alain de Cheveigné and Hideki Kawahara
 */
class YINDetector {
  constructor(bufferSize, sr) {
    this.bufferSize = bufferSize;
    this.halfBuffer = Math.floor(bufferSize / 2);
    this.sampleRate = sr;
    this.yinBuffer = new Float32Array(this.halfBuffer);
    this.probability = 0;
    
    // Frequency range in terms of lag (period)
    this.minPeriod = Math.floor(sr / MAX_FREQUENCY);
    this.maxPeriod = Math.min(Math.floor(sr / MIN_FREQUENCY), this.halfBuffer - 1);
  }
  
  /**
   * Step 1 & 2: Compute the difference function and cumulative mean normalized difference
   */
  computeDifference(buffer) {
    // Difference function
    for (let tau = 0; tau < this.halfBuffer; tau++) {
      this.yinBuffer[tau] = 0;
      for (let i = 0; i < this.halfBuffer; i++) {
        const delta = buffer[i] - buffer[i + tau];
        this.yinBuffer[tau] += delta * delta;
      }
    }
    
    // Cumulative mean normalized difference
    this.yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < this.halfBuffer; tau++) {
      runningSum += this.yinBuffer[tau];
      this.yinBuffer[tau] *= tau / runningSum;
    }
  }
  
  /**
   * Step 3: Absolute threshold
   * Find the first tau where the normalized difference is below threshold
   */
  absoluteThreshold() {
    let tau;
    
    // Search for the first minimum below threshold
    for (tau = this.minPeriod; tau < this.maxPeriod; tau++) {
      if (this.yinBuffer[tau] < YIN_THRESHOLD) {
        // Found a candidate - now find the actual minimum
        while (tau + 1 < this.maxPeriod && this.yinBuffer[tau + 1] < this.yinBuffer[tau]) {
          tau++;
        }
        this.probability = 1 - this.yinBuffer[tau];
        return tau;
      }
    }
    
    // No pitch found below threshold - find global minimum as fallback
    let minTau = this.minPeriod;
    let minVal = this.yinBuffer[this.minPeriod];
    for (tau = this.minPeriod + 1; tau < this.maxPeriod; tau++) {
      if (this.yinBuffer[tau] < minVal) {
        minVal = this.yinBuffer[tau];
        minTau = tau;
      }
    }
    
    this.probability = 1 - minVal;
    return minTau;
  }
  
  /**
   * Step 4: Parabolic interpolation for sub-sample accuracy
   */
  parabolicInterpolation(tauEstimate) {
    if (tauEstimate < 1 || tauEstimate >= this.halfBuffer - 1) {
      return tauEstimate;
    }
    
    const s0 = this.yinBuffer[tauEstimate - 1];
    const s1 = this.yinBuffer[tauEstimate];
    const s2 = this.yinBuffer[tauEstimate + 1];
    
    const denom = 2 * s1 - s2 - s0;
    if (Math.abs(denom) < 1e-10) {
      return tauEstimate;
    }
    
    const adjustment = (s2 - s0) / (2 * denom);
    
    if (Math.abs(adjustment) < 1) {
      return tauEstimate + adjustment;
    }
    return tauEstimate;
  }
  
  /**
   * Main detection function
   */
  detect(buffer) {
    // Compute difference function
    this.computeDifference(buffer);
    
    // Find period estimate
    const tauEstimate = this.absoluteThreshold();
    
    // Refine with parabolic interpolation
    const refinedTau = this.parabolicInterpolation(tauEstimate);
    
    // Convert period to frequency
    const frequency = this.sampleRate / refinedTau;
    
    // Sanity check
    if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY || !isFinite(frequency)) {
      return { frequency: 0, confidence: 0 };
    }
    
    return {
      frequency: frequency,
      confidence: Math.max(0, Math.min(1, this.probability))
    };
  }
}

/**
 * Oscillator for synthesis with band-limited waveforms
 */
class Oscillator {
  constructor(sr) {
    this.phase = 0;
    this.frequency = 0;
    this.targetFrequency = 0;
    this.amplitude = 0;
    this.targetAmplitude = 0;
    this.waveform = 'sine';
    this.oscSampleRate = sr;
    this.freqSmoothCoef = 0.995;
    this.ampSmoothCoef = 0.95;
  }
  
  setFrequency(freq) {
    this.targetFrequency = freq;
    if (this.frequency === 0) {
      this.frequency = freq;
    }
  }
  
  setAmplitude(amp) {
    this.targetAmplitude = amp;
  }
  
  setWaveform(waveform) {
    this.waveform = waveform;
  }
  
  process() {
    // Smooth frequency and amplitude
    this.frequency = this.frequency * this.freqSmoothCoef + 
                     this.targetFrequency * (1 - this.freqSmoothCoef);
    this.amplitude = this.amplitude * this.ampSmoothCoef + 
                     this.targetAmplitude * (1 - this.ampSmoothCoef);
    
    if (this.frequency <= 0 || this.amplitude < 0.0001) {
      return 0;
    }
    
    let sample;
    
    switch (this.waveform) {
      case 'sine':
        sample = Math.sin(2 * Math.PI * this.phase);
        break;
      
      case 'triangle':
        // Band-limited triangle using additive synthesis
        sample = 0;
        const maxHarmonicTri = Math.floor(this.oscSampleRate / (2 * this.frequency));
        for (let k = 0; k < Math.min(maxHarmonicTri, 10); k++) {
          const n = 2 * k + 1;
          const sign = (k % 2 === 0) ? 1 : -1;
          sample += sign * Math.sin(2 * Math.PI * n * this.phase) / (n * n);
        }
        sample *= 8 / (Math.PI * Math.PI);
        break;
      
      case 'sawtooth':
        // Band-limited sawtooth
        sample = 0;
        const maxHarmonicSaw = Math.floor(this.oscSampleRate / (2 * this.frequency));
        for (let k = 1; k <= Math.min(maxHarmonicSaw, 12); k++) {
          sample += Math.sin(2 * Math.PI * k * this.phase) / k;
        }
        sample *= 2 / Math.PI;
        break;
      
      default:
        sample = Math.sin(2 * Math.PI * this.phase);
    }
    
    this.phase += this.frequency / this.oscSampleRate;
    if (this.phase >= 1) {
      this.phase -= 1;
    }
    
    return sample * this.amplitude;
  }
}

/**
 * Envelope generator for gating
 */
class Envelope {
  constructor(sr) {
    this.value = 0;
    this.attackCoef = 0.1;
    this.releaseCoef = 0.01;
    this.envSampleRate = sr;
  }
  
  setAttack(ms) {
    const samples = (ms / 1000) * this.envSampleRate;
    this.attackCoef = samples > 0 ? 1 - Math.exp(-1 / samples) : 1;
  }
  
  setRelease(ms) {
    const samples = (ms / 1000) * this.envSampleRate;
    this.releaseCoef = samples > 0 ? 1 - Math.exp(-1 / samples) : 1;
  }
  
  process(gateOpen) {
    const target = gateOpen ? 1 : 0;
    const coef = gateOpen ? this.attackCoef : this.releaseCoef;
    this.value = this.value + coef * (target - this.value);
    return this.value;
  }
  
  getValue() {
    return this.value;
  }
}

/**
 * Main Audio Processor
 */
class IntonationMirrorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    this.config = {
      referenceMode: 'quantize',
      a4Tuning: 440,
      waveformType: 'sine',
      pitchCount: 1,
      outputLevel: 0.5,
      stabilitySmoothing: 0.8,
      inputThreshold: -60,
      confidenceThreshold: 0.15,
      attackTime: 10,
      releaseTime: 80,
      enableMicMonitoring: false,
    };
    
    // Ring buffer and analysis buffers
    this.ringBuffer = new RingBuffer(BUFFER_SIZE * 2);
    this.analysisBuffer = new Float32Array(BUFFER_SIZE);
    
    // YIN pitch detector
    this.yinDetector = new YINDetector(BUFFER_SIZE, sampleRate);
    
    // Oscillators and envelope
    this.oscillators = [
      new Oscillator(sampleRate),
      new Oscillator(sampleRate),
      new Oscillator(sampleRate),
    ];
    
    this.envelope = new Envelope(sampleRate);
    this.envelope.setAttack(this.config.attackTime);
    this.envelope.setRelease(this.config.releaseTime);
    
    // Processing state
    this.samplesSinceLastAnalysis = 0;
    this.hopCount = 0;
    
    // Pitch smoothing
    this.smoothedPitches = [0, 0, 0];
    this.smoothedConfidences = [0, 0, 0];
    this.noteHysteresis = [0, 0, 0];
    this.lastQuantizedMidi = [0, 0, 0];
    
    // Level metering
    this.rmsSmoothed = 0;
    this.lastGateOpen = false;
    
    // Latency tracking
    this.analysisLatency = 0;
    
    // Message handling
    this.port.onmessage = (event) => {
      if (event.data.type === 'config') {
        this.updateConfig(event.data.config);
      }
    };
    
    // Send ready message
    this.port.postMessage({
      type: 'ready',
      sampleRate: sampleRate,
    });
  }
  
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    
    if (newConfig.attackTime !== undefined) {
      this.envelope.setAttack(newConfig.attackTime);
    }
    if (newConfig.releaseTime !== undefined) {
      this.envelope.setRelease(newConfig.releaseTime);
    }
    
    if (newConfig.waveformType !== undefined) {
      for (const osc of this.oscillators) {
        osc.setWaveform(newConfig.waveformType);
      }
    }
  }
  
  frequencyToPitchInfo(freq, confidence) {
    const a4 = this.config.a4Tuning;
    const midiFloat = 69 + 12 * Math.log2(freq / a4);
    const midiRounded = Math.round(midiFloat);
    const referenceFreq = a4 * Math.pow(2, (midiRounded - 69) / 12);
    const cents = 1200 * Math.log2(freq / referenceFreq);
    
    const noteIndex = ((midiRounded % 12) + 12) % 12;
    const octave = Math.floor(midiRounded / 12) - 1;
    const noteName = `${NOTE_NAMES[noteIndex]}${octave}`;
    
    return {
      frequency: freq,
      confidence,
      midiNote: midiFloat,
      noteName,
      cents,
      referenceFrequency: referenceFreq,
    };
  }
  
  getSynthFrequency(pitch, index) {
    if (pitch.frequency <= 0) return 0;
    
    const a4 = this.config.a4Tuning;
    
    switch (this.config.referenceMode) {
      case 'mirror':
        return pitch.frequency;
      
      case 'quantize': {
        const targetMidi = Math.round(pitch.midiNote);
        
        if (targetMidi !== this.lastQuantizedMidi[index]) {
          this.noteHysteresis[index]++;
          if (this.noteHysteresis[index] >= 3) {
            this.lastQuantizedMidi[index] = targetMidi;
            this.noteHysteresis[index] = 0;
          }
        } else {
          this.noteHysteresis[index] = 0;
        }
        
        return a4 * Math.pow(2, (this.lastQuantizedMidi[index] - 69) / 12);
      }
      
      case 'scale': {
        if (!this.config.scale) {
          return pitch.referenceFrequency;
        }
        
        const midi = Math.round(pitch.midiNote);
        const noteClass = ((midi % 12) - this.config.scale.root + 12) % 12;
        
        if (this.config.scale.intervals.includes(noteClass)) {
          return a4 * Math.pow(2, (midi - 69) / 12);
        }
        
        let minDist = 12;
        let nearestInterval = 0;
        for (const interval of this.config.scale.intervals) {
          const dist = Math.min(
            Math.abs(noteClass - interval),
            12 - Math.abs(noteClass - interval)
          );
          if (dist < minDist) {
            minDist = dist;
            nearestInterval = interval;
          }
        }
        
        const octave = Math.floor(midi / 12);
        const targetMidi = octave * 12 + this.config.scale.root + nearestInterval;
        return a4 * Math.pow(2, (targetMidi - 69) / 12);
      }
      
      default:
        return pitch.referenceFrequency;
    }
  }
  
  calculateRms(input) {
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      sum += input[i] * input[i];
    }
    return Math.sqrt(sum / input.length);
  }
  
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || input.length === 0) {
      return true;
    }
    
    const inputChannel = input[0];
    if (!inputChannel || inputChannel.length === 0) {
      return true;
    }
    
    // Write input to ring buffer
    this.ringBuffer.write(inputChannel);
    this.samplesSinceLastAnalysis += inputChannel.length;
    
    // Update RMS level
    const currentRms = this.calculateRms(inputChannel);
    this.rmsSmoothed = this.rmsSmoothed * 0.9 + currentRms * 0.1;
    
    // Run analysis at hop intervals
    if (this.samplesSinceLastAnalysis >= HOP_SIZE) {
      this.samplesSinceLastAnalysis -= HOP_SIZE;
      this.hopCount++;
      
      if (this.ringBuffer.read(this.analysisBuffer)) {
        // Pitch detection using YIN
        const { frequency, confidence } = this.yinDetector.detect(this.analysisBuffer);
        
        // Smoothing
        const alpha = this.config.stabilitySmoothing;
        
        if (frequency > 0 && confidence > this.config.confidenceThreshold * 0.5) {
          const prevFreq = this.smoothedPitches[0];
          if (prevFreq === 0 || Math.abs(Math.log2(frequency / prevFreq)) < 0.5) {
            // Smooth update
            this.smoothedPitches[0] = prevFreq === 0 ? frequency : 
              prevFreq * alpha + frequency * (1 - alpha);
            this.smoothedConfidences[0] = this.smoothedConfidences[0] * alpha + 
              confidence * (1 - alpha);
          } else {
            // Jump to new pitch
            this.smoothedPitches[0] = frequency;
            this.smoothedConfidences[0] = confidence * 0.5;
          }
        } else {
          // Decay when no valid detection
          this.smoothedConfidences[0] *= 0.9;
          if (this.smoothedConfidences[0] < 0.05) {
            this.smoothedPitches[0] = 0;
          }
        }
        
        // Calculate gate state
        const rmsDb = 20 * Math.log10(Math.max(this.rmsSmoothed, 1e-10));
        const gateOpen = rmsDb > this.config.inputThreshold && 
                        this.smoothedConfidences[0] > this.config.confidenceThreshold;
        
        this.lastGateOpen = gateOpen;
        
        // Build pitch info for detected pitches
        const detectedPitches = [];
        for (let i = 0; i < this.config.pitchCount; i++) {
          if (this.smoothedPitches[i] > 0 && this.smoothedConfidences[i] > 0.1) {
            detectedPitches.push(
              this.frequencyToPitchInfo(this.smoothedPitches[i], this.smoothedConfidences[i])
            );
          }
        }
        
        // Calculate latency (analysis window + hop)
        const analysisLatencyMs = (BUFFER_SIZE / sampleRate) * 1000;
        const hopLatencyMs = (HOP_SIZE / sampleRate) * 1000;
        this.analysisLatency = analysisLatencyMs + hopLatencyMs;
        
        // Create analysis result
        const analysisResult = {
          pitches: detectedPitches,
          rmsLevel: this.rmsSmoothed,
          rmsDb,
          gateOpen,
          timestamp: currentTime,
          latencyMs: this.analysisLatency,
        };
        
        // Update oscillators
        for (let i = 0; i < 3; i++) {
          if (i < detectedPitches.length && gateOpen) {
            const synthFreq = this.getSynthFrequency(detectedPitches[i], i);
            this.oscillators[i].setFrequency(synthFreq);
            this.oscillators[i].setAmplitude(0.5 / this.config.pitchCount);
          } else {
            this.oscillators[i].setAmplitude(0);
          }
        }
        
        // Send analysis to main thread (throttled)
        if (this.hopCount % 4 === 0) {
          this.port.postMessage({
            type: 'analysis',
            data: analysisResult,
          });
        }
      }
    }
    
    // Generate synthesis output
    const outputChannel = output[0];
    if (outputChannel) {
      for (let i = 0; i < outputChannel.length; i++) {
        const env = this.envelope.process(this.lastGateOpen);
        let sample = 0;
        
        for (let j = 0; j < this.config.pitchCount; j++) {
          sample += this.oscillators[j].process();
        }
        
        outputChannel[i] = sample * env;
        
        // Add mic monitoring if enabled
        if (this.config.enableMicMonitoring && inputChannel) {
          outputChannel[i] += inputChannel[i] * 0.3;
        }
      }
    }
    
    return true;
  }
}

registerProcessor('intonation-mirror-processor', IntonationMirrorProcessor);
