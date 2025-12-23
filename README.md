# Violin Intonation Mirror

A real-time browser-based intonation aid for violinists. The app listens to your microphone, detects the pitch you're playing, and synthesizes a clean reference tone so you can hear exactly where you should be.

## Features

- **Real-time pitch detection** using Harmonic Product Spectrum (HPS) algorithm
- **Three reference modes**:
  - **Mirror**: Plays back exactly what you're playing (continuous)
  - **Quantize**: Snaps to the nearest equal-tempered pitch
  - **Scale**: Snaps to notes within a selected scale
- **Low latency**: Target <50ms end-to-end
- **Configurable A4 tuning**: 415-445 Hz (for baroque and modern tuning)
- **Multiple waveforms**: Sine, triangle, soft sawtooth
- **Visual feedback**: Cent deviation meter, note display, confidence indicator
- **Privacy-first**: All audio processing happens locally in your browser

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone or navigate to the project
cd intune

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open at `http://localhost:5173`

### Building for Production

```bash
npm run build
npm run preview
```

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome | ✅ Full support |
| Edge | ✅ Full support |
| Safari (macOS) | ✅ Supported (may require user gesture) |
| Firefox | ⚠️ Limited (AudioWorklet support varies) |

**Note**: Safari requires a user gesture (click) before audio context can start. The app handles this automatically.

## Usage Guide

1. **Grant microphone access**: Click "Enable Microphone & Start"
2. **Play your violin**: The app will detect the pitch
3. **Listen to the reference**: A synthesized tone plays at the detected pitch
4. **Adjust your intonation**: Use the cent meter to fine-tune

### Reference Modes

- **Mirror**: The synth follows your exact pitch (great for vibrato practice)
- **Quantize**: Snaps to nearest semitone (best for checking intonation)
- **Scale**: Only plays notes in the selected scale

### Controls

| Control | Description |
|---------|-------------|
| A4 Tuning | Reference pitch for A4 (415-445 Hz) |
| Pitches | Number of simultaneous tones (1-3) |
| Waveform | Synthesis waveform type |
| Output Level | Volume of reference tone |
| Stability | Smoothing amount (higher = more stable, slower response) |
| Gate Threshold | Minimum input level to trigger detection |
| Confidence Threshold | Minimum pitch detection confidence |
| Attack/Release | Envelope timing for smooth note onsets |

## Technical Details

### Audio Architecture

```
Microphone → MediaStreamAudioSourceNode
                    ↓
            AudioWorkletNode (analysis + synthesis)
                    ↓
                GainNode → Destination
```

### DSP Specification

- **FFT Size**: 4096 samples (~85ms @ 48kHz)
- **Hop Size**: 512 samples (~10.7ms @ 48kHz)
- **Window**: Hann
- **Pitch Detection**: Harmonic Product Spectrum (HPS) with parabolic interpolation
- **Frequency Range**: 50 Hz - 6 kHz

### Pitch Detection Algorithm

The app uses Harmonic Product Spectrum (HPS) to robustly detect the fundamental frequency even when harmonics are stronger:

1. Compute FFT magnitude spectrum
2. Downsample spectrum by factors 2, 3, 4
3. Multiply original with downsampled versions
4. Find maximum → fundamental frequency candidate
5. Refine with parabolic interpolation

### Music Theory Reference

**MIDI to Frequency**:
```
f = 440 × 2^((m - 69) / 12)
```

**Frequency to MIDI**:
```
m = 69 + 12 × log₂(f / 440)
```

**Cents Deviation**:
```
cents = 1200 × log₂(f / f_ref)
```

### Violin Open Strings (Standard Tuning)

| String | Frequency | MIDI |
|--------|-----------|------|
| G3 | 196.0 Hz | 55 |
| D4 | 293.66 Hz | 62 |
| A4 | 440.0 Hz | 69 |
| E5 | 659.25 Hz | 76 |

## Project Structure

```
src/
├── audio/
│   ├── engine.ts         # AudioContext setup and routing
│   ├── hooks.ts          # React hooks for audio state
│   ├── pitch-utils.ts    # FFT, HPS, pitch calculations
│   ├── types.ts          # TypeScript interfaces
│   └── worklet/
│       └── processor.ts  # AudioWorklet DSP code
├── ui/
│   └── components/       # React UI components
│       ├── PitchDisplay.tsx
│       ├── CentMeter.tsx
│       ├── LevelMeter.tsx
│       ├── ControlPanel.tsx
│       └── DebugPanel.tsx
├── App.tsx               # Main application
└── main.tsx              # Entry point
```

## Test Tones

For testing, you can use these online tone generators:
- [Online Tone Generator](https://www.szynalski.com/tone-generator/)
- [Function Generator](https://www.zeitnitz.eu/scopes/function_generator)

Test frequencies (A4 = 440 Hz):
- G3: 196.0 Hz
- D4: 293.66 Hz
- A4: 440.0 Hz
- E5: 659.25 Hz

## Performance Targets

| Metric | Target | Acceptable |
|--------|--------|------------|
| End-to-end latency | ≤50ms | ≤80ms |
| CPU usage | <10% | <15% |
| Pitch accuracy | ±5 cents | ±10 cents |

## Privacy

- **No audio upload**: All processing happens locally
- **No tracking**: No analytics or telemetry
- **Microphone access**: Only used while the app is running

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions welcome! Please open an issue first to discuss proposed changes.

## Acknowledgments

- WebAudio API documentation
- Digital signal processing resources from CCRMA Stanford
- React and Vite communities
