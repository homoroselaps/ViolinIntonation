/**
 * Pitch History Visualization Component
 * 
 * Shows a scrolling graph of pitch over time, displaying cents deviation
 * from the target note. Useful for seeing vibrato and intonation trends.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { PitchHistoryPoint } from '../../audio/types';
import './PitchHistory.css';

interface PitchHistoryProps {
  history: PitchHistoryPoint[];
  maxPoints?: number;
  height?: number;
  showGrid?: boolean;
}

const CENTS_RANGE = 50; // ±50 cents displayed

export const PitchHistory: React.FC<PitchHistoryProps> = ({
  history,
  maxPoints = 200,
  height = 120,
  showGrid = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = '#2a2a4e';
      ctx.lineWidth = 1;
      
      // Horizontal grid lines (cents)
      const centsLines = [-40, -20, 0, 20, 40];
      ctx.beginPath();
      for (const cents of centsLines) {
        const y = height / 2 - (cents / CENTS_RANGE) * (height / 2);
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
      
      // Center line (in tune)
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      
      // Labels
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('+50¢', 4, 12);
      ctx.fillText('  0¢', 4, height / 2 + 4);
      ctx.fillText('-50¢', 4, height - 4);
    }
    
    // Draw pitch history
    if (history.length < 2) return;
    
    const pointWidth = width / maxPoints;
    const startIdx = Math.max(0, history.length - maxPoints);
    const visibleHistory = history.slice(startIdx);
    
    // Draw confidence as background
    ctx.beginPath();
    for (let i = 0; i < visibleHistory.length; i++) {
      const point = visibleHistory[i];
      const x = i * pointWidth;
      const alpha = point.confidence * 0.3;
      
      ctx.fillStyle = `rgba(74, 222, 128, ${alpha})`;
      ctx.fillRect(x, 0, pointWidth + 1, height);
    }
    
    // Draw cents deviation line
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    
    let firstPoint = true;
    for (let i = 0; i < visibleHistory.length; i++) {
      const point = visibleHistory[i];
      if (point.confidence < 0.1) continue;
      
      const x = i * pointWidth;
      // Clamp cents to display range
      const clampedCents = Math.max(-CENTS_RANGE, Math.min(CENTS_RANGE, point.cents));
      const y = height / 2 - (clampedCents / CENTS_RANGE) * (height / 2);
      
      if (firstPoint) {
        ctx.moveTo(x, y);
        firstPoint = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    
    // Draw current note name
    if (visibleHistory.length > 0) {
      const lastPoint = visibleHistory[visibleHistory.length - 1];
      if (lastPoint.confidence > 0.1) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(lastPoint.noteName, width - 8, 20);
        
        // Show cents deviation
        const centsStr = lastPoint.cents >= 0 
          ? `+${lastPoint.cents.toFixed(0)}¢` 
          : `${lastPoint.cents.toFixed(0)}¢`;
        ctx.font = '12px monospace';
        ctx.fillStyle = Math.abs(lastPoint.cents) < 10 ? '#4ade80' : '#f472b6';
        ctx.fillText(centsStr, width - 8, 36);
      }
    }
  }, [history, maxPoints, height, showGrid]);
  
  useEffect(() => {
    draw();
  }, [draw]);
  
  // Handle resize
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);
  
  return (
    <div className="pitch-history" ref={containerRef}>
      <canvas ref={canvasRef} className="pitch-history-canvas" />
    </div>
  );
};

export default PitchHistory;
