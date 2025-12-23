/**
 * Latency Indicator Component
 * 
 * Shows the estimated round-trip audio latency
 */

import React from 'react';
import './LatencyIndicator.css';

interface LatencyIndicatorProps {
  latencyMs: number;
  targetMs?: number;
}

export const LatencyIndicator: React.FC<LatencyIndicatorProps> = ({
  latencyMs,
  targetMs = 50,
}) => {
  const isGood = latencyMs <= targetMs;
  const isAcceptable = latencyMs <= targetMs * 1.6; // ≤80ms
  
  let status: 'good' | 'acceptable' | 'high';
  if (isGood) {
    status = 'good';
  } else if (isAcceptable) {
    status = 'acceptable';
  } else {
    status = 'high';
  }
  
  return (
    <div className={`latency-indicator latency-${status}`}>
      <span className="latency-icon">⏱</span>
      <span className="latency-value">{latencyMs}ms</span>
      <span className="latency-label">latency</span>
    </div>
  );
};

export default LatencyIndicator;
