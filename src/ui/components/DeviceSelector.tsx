/**
 * Device Selector Component
 * 
 * Allows users to select audio input and output devices
 */

import React from 'react';
import { AudioDevice } from '../../audio/types';
import './DeviceSelector.css';

interface DeviceSelectorProps {
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputId: string | null;
  selectedOutputId: string | null;
  onInputChange: (deviceId: string) => void;
  onOutputChange: (deviceId: string) => void;
  disabled?: boolean;
}

export const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  inputDevices,
  outputDevices,
  selectedInputId,
  selectedOutputId,
  onInputChange,
  onOutputChange,
  disabled = false,
}) => {
  return (
    <div className="device-selector">
      <div className="device-selector-row">
        <label className="device-label">
          <span className="device-icon">🎤</span>
          Input
        </label>
        <select
          className="device-select"
          value={selectedInputId || ''}
          onChange={(e) => onInputChange(e.target.value)}
          disabled={disabled || inputDevices.length === 0}
        >
          {inputDevices.length === 0 ? (
            <option value="">No devices found</option>
          ) : (
            inputDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))
          )}
        </select>
      </div>
      
      <div className="device-selector-row">
        <label className="device-label">
          <span className="device-icon">🔊</span>
          Output
        </label>
        <select
          className="device-select"
          value={selectedOutputId || ''}
          onChange={(e) => onOutputChange(e.target.value)}
          disabled={disabled || outputDevices.length === 0}
        >
          {outputDevices.length === 0 ? (
            <option value="">Default</option>
          ) : (
            outputDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))
          )}
        </select>
      </div>
    </div>
  );
};

export default DeviceSelector;
