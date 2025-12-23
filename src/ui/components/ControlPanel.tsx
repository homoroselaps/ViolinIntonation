/**
 * Control Panel Component
 * Settings and controls for the audio engine
 */

import React from 'react';
import { AudioConfig, ReferenceMode, WaveformType, SCALES, NOTE_NAMES } from '../../audio/types';
import './ControlPanel.css';

interface ControlPanelProps {
  config: AudioConfig;
  onConfigChange: (config: Partial<AudioConfig>) => void;
  disabled?: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config,
  onConfigChange,
  disabled = false,
}) => {
  return (
    <div className={`control-panel ${disabled ? 'disabled' : ''}`}>
      <h3>Settings</h3>
      
      {/* Reference Mode */}
      <div className="control-group">
        <label>Reference Mode</label>
        <div className="button-group">
          {(['mirror', 'quantize', 'scale'] as ReferenceMode[]).map(mode => (
            <button
              key={mode}
              className={config.referenceMode === mode ? 'active' : ''}
              onClick={() => onConfigChange({ referenceMode: mode })}
              disabled={disabled}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Scale selection (only for scale mode) */}
      {config.referenceMode === 'scale' && (
        <div className="control-group">
          <label>Scale</label>
          <div className="scale-selector">
            <select
              value={config.scale?.root ?? 0}
              onChange={(e) => onConfigChange({
                scale: {
                  ...config.scale!,
                  root: parseInt(e.target.value),
                },
              })}
              disabled={disabled}
            >
              {NOTE_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
            <select
              value={Object.entries(SCALES).find(
                ([, s]) => s.intervals.join(',') === config.scale?.intervals.join(',')
              )?.[0] ?? 'major'}
              onChange={(e) => {
                const scale = SCALES[e.target.value];
                onConfigChange({
                  scale: {
                    ...scale,
                    root: config.scale?.root ?? 0,
                  },
                });
              }}
              disabled={disabled}
            >
              {Object.entries(SCALES).map(([key, scale]) => (
                <option key={key} value={key}>{scale.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      
      {/* A4 Tuning */}
      <div className="control-group">
        <label>A4 Tuning: {config.a4Tuning} Hz</label>
        <input
          type="range"
          min="415"
          max="445"
          step="1"
          value={config.a4Tuning}
          onChange={(e) => onConfigChange({ a4Tuning: parseInt(e.target.value) })}
          disabled={disabled}
        />
        <div className="range-labels">
          <span>415</span>
          <span>440</span>
          <span>445</span>
        </div>
      </div>
      
      {/* Number of pitches */}
      <div className="control-group">
        <label>Pitches to Synthesize</label>
        <div className="button-group">
          {([1, 2, 3] as const).map(n => (
            <button
              key={n}
              className={config.pitchCount === n ? 'active' : ''}
              onClick={() => onConfigChange({ pitchCount: n })}
              disabled={disabled}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      
      {/* Waveform */}
      <div className="control-group">
        <label>Waveform</label>
        <div className="button-group">
          {(['sine', 'triangle', 'sawtooth'] as WaveformType[]).map(type => (
            <button
              key={type}
              className={config.waveformType === type ? 'active' : ''}
              onClick={() => onConfigChange({ waveformType: type })}
              disabled={disabled}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Output Level */}
      <div className="control-group">
        <label>Output Level: {Math.round(config.outputLevel * 100)}%</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={config.outputLevel}
          onChange={(e) => onConfigChange({ outputLevel: parseFloat(e.target.value) })}
          disabled={disabled}
        />
      </div>
      
      {/* Stability */}
      <div className="control-group">
        <label>Stability: {Math.round(config.stabilitySmoothing * 100)}%</label>
        <input
          type="range"
          min="0"
          max="0.99"
          step="0.01"
          value={config.stabilitySmoothing}
          onChange={(e) => onConfigChange({ stabilitySmoothing: parseFloat(e.target.value) })}
          disabled={disabled}
        />
      </div>
      
      {/* Gate Threshold */}
      <div className="control-group">
        <label>Gate Threshold: {config.inputThreshold} dB</label>
        <input
          type="range"
          min="-90"
          max="-30"
          step="1"
          value={config.inputThreshold}
          onChange={(e) => onConfigChange({ inputThreshold: parseInt(e.target.value) })}
          disabled={disabled}
        />
      </div>
      
      {/* Confidence Threshold */}
      <div className="control-group">
        <label>Confidence Threshold: {Math.round(config.confidenceThreshold * 100)}%</label>
        <input
          type="range"
          min="0.05"
          max="0.6"
          step="0.05"
          value={config.confidenceThreshold}
          onChange={(e) => onConfigChange({ confidenceThreshold: parseFloat(e.target.value) })}
          disabled={disabled}
        />
      </div>
      
      {/* Attack/Release */}
      <div className="control-row">
        <div className="control-group half">
          <label>Attack: {config.attackTime}ms</label>
          <input
            type="range"
            min="5"
            max="50"
            step="1"
            value={config.attackTime}
            onChange={(e) => onConfigChange({ attackTime: parseInt(e.target.value) })}
            disabled={disabled}
          />
        </div>
        <div className="control-group half">
          <label>Release: {config.releaseTime}ms</label>
          <input
            type="range"
            min="20"
            max="300"
            step="5"
            value={config.releaseTime}
            onChange={(e) => onConfigChange({ releaseTime: parseInt(e.target.value) })}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
};
