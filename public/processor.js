/**
 * Audio Worklet Processor for Violin Intonation Mirror
 * 
 * This file runs in the AudioWorklet context and handles:
 * - Ring buffer for incoming audio samples
 * - FFT analysis with peak detection and optional HPS
 * - Synthesis oscillator bank
 * - Envelope/gate control
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// DSP Constants
const FFT_SIZE = 4096;
const HOP_SIZE = 512;
const MIN_FREQUENCY = 80;   // Below violin G3
const MAX_FREQUENCY = 4000; // Above violin E6
const HPS_HARMONICS = 3;    // Reduced for better pure tone handling

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
 * Oscillator for synthesis
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
    this.freqSmoothCoef = 0.99;  // Faster frequency tracking
    this.ampSmoothCoef = 0.95;   // Faster amplitude response
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
        sample = 4 * Math.abs(this.phase - 0.5) - 1;
        break;
      
      case 'sawtooth':
        sample = 0;
        for (let k = 1; k <= 8; k++) {
          sample += Math.sin(2 * Math.PI * k * this.phase) / k;
        }
        sample *= 0.5;
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
      outputLevel: 0.5,           // Increased default output
      stabilitySmoothing: 0.7,    // Less smoothing for faster response
      inputThreshold: -70,        // Much lower threshold for quiet inputs
      confidenceThreshold: 0.15,  // Lower confidence threshold
      attackTime: 10,             // Faster attack
      releaseTime: 80,
      enableMicMonitoring: false,
    };
    
    this.ringBuffer = new RingBuffer(FFT_SIZE * 2);
    this.analysisBuffer = new Float32Array(FFT_SIZE);
    this.fftReal = new Float32Array(FFT_SIZE);
    this.fftImag = new Float32Array(FFT_SIZE);
    this.magnitudes = new Float32Array(FFT_SIZE / 2);
    
    // Pre-compute Hann window
    this.hannWindow = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      this.hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
    }
    
    this.oscillators = [
      new Oscillator(sampleRate),
      new Oscillator(sampleRate),
      new Oscillator(sampleRate),
    ];
    
    this.envelope = new Envelope(sampleRate);
    this.envelope.setAttack(this.config.attackTime);
    this.envelope.setRelease(this.config.releaseTime);
    
    this.samplesSinceLastAnalysis = 0;
    this.hopCount = 0;
    
    this.smoothedPitches = [0, 0, 0];
    this.smoothedConfidences = [0, 0, 0];
    this.noteHysteresis = [0, 0, 0];
    this.lastQuantizedMidi = [0, 0, 0];
    
    this.rmsSmoothed = 0;
    this.lastGateOpen = false;
    
    this.port.onmessage = (event) => {
      if (event.data.type === 'config') {
        this.updateConfig(event.data.config);
        console.log('[Worklet] Config updated:', event.data.config);
      }
    };
    
    this.port.postMessage({
      type: 'ready',
      sampleRate: sampleRate,
    });
    
    console.log('[Worklet] Processor initialized, sampleRate:', sampleRate);
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
  
  computeFFT() {
    for (let i = 0; i < FFT_SIZE; i++) {
      this.fftReal[i] = this.analysisBuffer[i] * this.hannWindow[i];
      this.fftImag[i] = 0;
    }
    
    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < FFT_SIZE - 1; i++) {
      if (i < j) {
        const tempR = this.fftReal[i];
        const tempI = this.fftImag[i];
        this.fftReal[i] = this.fftReal[j];
        this.fftImag[i] = this.fftImag[j];
        this.fftReal[j] = tempR;
        this.fftImag[j] = tempI;
      }
      let k = FFT_SIZE >> 1;
      while (k <= j) {
        j -= k;
        k >>= 1;
      }
      j += k;
    }
    
    // Cooley-Tukey FFT
    for (let len = 2; len <= FFT_SIZE; len <<= 1) {
      const halfLen = len >> 1;
      const angle = (-2 * Math.PI) / len;
      const wReal = Math.cos(angle);
      const wImag = Math.sin(angle);
      
      for (let i = 0; i < FFT_SIZE; i += len) {
        let curReal = 1;
        let curImag = 0;
        
        for (let k = 0; k < halfLen; k++) {
          const evenIdx = i + k;
          const oddIdx = i + k + halfLen;
          
          const tReal = curReal * this.fftReal[oddIdx] - curImag * this.fftImag[oddIdx];
          const tImag = curReal * this.fftImag[oddIdx] + curImag * this.fftReal[oddIdx];
          
          this.fftReal[oddIdx] = this.fftReal[evenIdx] - tReal;
          this.fftImag[oddIdx] = this.fftImag[evenIdx] - tImag;
          this.fftReal[evenIdx] = this.fftReal[evenIdx] + tReal;
          this.fftImag[evenIdx] = this.fftImag[evenIdx] + tImag;
          
          const nextReal = curReal * wReal - curImag * wImag;
          curImag = curReal * wImag + curImag * wReal;
          curReal = nextReal;
        }
      }
    }
    
    // Compute magnitude spectrum
    for (let i = 0; i < FFT_SIZE / 2; i++) {
      this.magnitudes[i] = Math.sqrt(
        this.fftReal[i] * this.fftReal[i] + 
        this.fftImag[i] * this.fftImag[i]
      );
    }
  }
  
  detectPitch() {
    const binWidth = sampleRate / FFT_SIZE;
    const minBin = Math.ceil(MIN_FREQUENCY / binWidth);
    const maxBin = Math.min(
      Math.floor(MAX_FREQUENCY / binWidth),
      this.magnitudes.length - 1
    );
    
    if (maxBin <= minBin) {
      return { frequency: 0, confidence: 0 };
    }
    
    // Calculate noise floor from lower quartile of magnitudes
    const magSlice = this.magnitudes.slice(minBin, maxBin);
    const sortedMags = Array.from(magSlice).sort((a, b) => a - b);
    const noiseFloor = sortedMags[Math.floor(sortedMags.length * 0.5)] || 1e-10;
    
    // Find all peaks (local maxima significantly above noise)
    const peaks = [];
    for (let i = minBin + 1; i < maxBin - 1; i++) {
      const mag = this.magnitudes[i];
      // Must be a local maximum and above noise threshold
      if (mag > this.magnitudes[i - 1] && 
          mag > this.magnitudes[i + 1] &&
          mag > noiseFloor * 3) {
        peaks.push({ bin: i, mag: mag });
      }
    }
    
    if (peaks.length === 0) {
      return { frequency: 0, confidence: 0 };
    }
    
    // Sort by magnitude (strongest first)
    peaks.sort((a, b) => b.mag - a.mag);
    
    // Take the strongest peak as our fundamental estimate
    // For violin and most musical instruments, the fundamental is usually strong
    let bestBin = peaks[0].bin;
    let bestMag = peaks[0].mag;
    
    // Parabolic interpolation for sub-bin accuracy
    let refinedBin = bestBin;
    if (bestBin > 0 && bestBin < this.magnitudes.length - 1) {
      const alpha = this.magnitudes[bestBin - 1];
      const beta = this.magnitudes[bestBin];
      const gamma = this.magnitudes[bestBin + 1];
      const denom = alpha - 2 * beta + gamma;
      if (Math.abs(denom) > 1e-10) {
        const p = 0.5 * (alpha - gamma) / denom;
        if (Math.abs(p) < 0.5) {
          refinedBin = bestBin + p;
        }
      }
    }
    
    const frequency = refinedBin * binWidth;
    
    // Sanity check
    if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) {
      return { frequency: 0, confidence: 0 };
    }
    
    // Confidence based on peak-to-noise ratio
    const snr = bestMag / noiseFloor;
    const confidence = Math.min(1, Math.max(0, (snr - 3) / 20));
    
    return { frequency, confidence };
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
    
    this.ringBuffer.write(inputChannel);
    this.samplesSinceLastAnalysis += inputChannel.length;
    
    const currentRms = this.calculateRms(inputChannel);
    this.rmsSmoothed = this.rmsSmoothed * 0.9 + currentRms * 0.1;
    
    if (this.samplesSinceLastAnalysis >= HOP_SIZE) {
      this.samplesSinceLastAnalysis -= HOP_SIZE;
      this.hopCount++;
      
      if (this.ringBuffer.read(this.analysisBuffer)) {
        this.computeFFT();
        
        const { frequency, confidence } = this.detectPitch();
        
        const alpha = this.config.stabilitySmoothing;
        
        // Only update if we have a valid detection
        if (frequency > 0 && confidence > this.config.confidenceThreshold * 0.5) {
          const prevFreq = this.smoothedPitches[0];
          // Accept new frequency if no previous, or if within half an octave
          if (prevFreq === 0 || Math.abs(Math.log2(frequency / prevFreq)) < 0.5) {
            this.smoothedPitches[0] = this.smoothedPitches[0] * alpha + frequency * (1 - alpha);
            this.smoothedConfidences[0] = this.smoothedConfidences[0] * alpha + confidence * (1 - alpha);
          } else {
            // Jump to new frequency if it's very different (new note)
            this.smoothedPitches[0] = frequency;
            this.smoothedConfidences[0] = confidence * 0.5; // Start with lower confidence
          }
        } else {
          // Decay both confidence and pitch when no valid detection
          this.smoothedConfidences[0] *= 0.9;
          if (this.smoothedConfidences[0] < 0.05) {
            this.smoothedPitches[0] = 0; // Reset pitch when confidence is very low
          }
        }
        
        // Debug: log raw detection vs smoothed
        if (this.hopCount % 100 === 0) {
          console.log('[Worklet] Raw detect: freq=', frequency.toFixed(1), 'conf=', confidence.toFixed(2),
                      '| Smoothed: freq=', this.smoothedPitches[0].toFixed(1), 'conf=', this.smoothedConfidences[0].toFixed(2));
        }
        
        const rmsDb = 20 * Math.log10(Math.max(this.rmsSmoothed, 1e-10));
        const gateOpen = rmsDb > this.config.inputThreshold && 
                        this.smoothedConfidences[0] > this.config.confidenceThreshold;
        
        this.lastGateOpen = gateOpen;
        
        const detectedPitches = [];
        
        for (let i = 0; i < this.config.pitchCount; i++) {
          if (this.smoothedPitches[i] > 0 && this.smoothedConfidences[i] > 0.1) {
            detectedPitches.push(
              this.frequencyToPitchInfo(this.smoothedPitches[i], this.smoothedConfidences[i])
            );
          }
        }
        
        const analysisResult = {
          pitches: detectedPitches,
          rmsLevel: this.rmsSmoothed,
          rmsDb,
          gateOpen,
          timestamp: currentTime,
        };
        
        // Update oscillators
        for (let i = 0; i < 3; i++) {
          if (i < detectedPitches.length && gateOpen) {
            const synthFreq = this.getSynthFrequency(detectedPitches[i], i);
            this.oscillators[i].setFrequency(synthFreq);
            // Use fixed amplitude - actual volume is controlled by GainNode in main thread
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
        
        // Debug logging every ~2 seconds
        if (this.hopCount % 200 === 0) {
          const envVal = this.envelope.getValue();
          console.log('[Worklet] rmsDb:', rmsDb.toFixed(1), 
                      'threshold:', this.config.inputThreshold,
                      'conf:', this.smoothedConfidences[0].toFixed(2),
                      'confThresh:', this.config.confidenceThreshold,
                      'gate:', gateOpen,
                      'freq:', this.smoothedPitches[0].toFixed(1),
                      'osc0 freq:', this.oscillators[0].frequency.toFixed(1),
                      'osc0 targetAmp:', this.oscillators[0].targetAmplitude.toFixed(3),
                      'osc0 amp:', this.oscillators[0].amplitude.toFixed(3),
                      'envelope:', envVal.toFixed(3));
        }
      }
    }
    
    // Generate synthesis output
    const outputChannel = output[0];
    if (outputChannel) {
      let maxSample = 0;
      for (let i = 0; i < outputChannel.length; i++) {
        const env = this.envelope.process(this.lastGateOpen);
        let sample = 0;
        
        for (let j = 0; j < this.config.pitchCount; j++) {
          sample += this.oscillators[j].process();
        }
        
        outputChannel[i] = sample * env;
        if (Math.abs(outputChannel[i]) > maxSample) {
          maxSample = Math.abs(outputChannel[i]);
        }
        
        // Add mic monitoring if enabled
        if (this.config.enableMicMonitoring && inputChannel) {
          outputChannel[i] += inputChannel[i] * 0.3;
        }
      }
      
      // Log output level periodically
      if (this.hopCount % 200 === 0 && maxSample > 0.001) {
        console.log('[Worklet] Output peak:', maxSample.toFixed(4));
      }
    }
    
    return true;
  }
}

registerProcessor('intonation-mirror-processor', IntonationMirrorProcessor);
