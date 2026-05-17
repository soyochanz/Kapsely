import React, { useState, useEffect } from 'react';
import { timerConfigManager } from '../utils/timerConfig';
import type { ModelTimerConfig } from '../utils/timerConfig';

interface LiveTimerProps {
  date: string;
  modelId?: string;
  style?: React.CSSProperties;
  configOverride?: ModelTimerConfig;
  hideLabel?: boolean;
  isOpened?: boolean;
}

const LiveTimer: React.FC<LiveTimerProps> = ({
  date,
  modelId,
  style,
  configOverride,
  hideLabel,
  isOpened
}) => {
  const [label, setLabel] = useState('');
  const [savedConfig, setSavedConfig] = useState<ModelTimerConfig | null>(null);

  const config = configOverride || savedConfig;

  useEffect(() => {
    if (!modelId) return;
    const updateConfig = () => {
      const newConfig = timerConfigManager.getConfig(modelId);
      setSavedConfig(newConfig);
    };
    updateConfig();
    return timerConfigManager.subscribe(updateConfig);
  }, [modelId]);

  useEffect(() => {
    const update = () => {
      if (!date) {
        setLabel('');
        return;
      }
      const end = new Date(date).getTime();
      if (isNaN(end)) {
        setLabel('');
        return;
      }
      const now = Date.now();
      const diff = end - now;

      let newLabel = '';
      if (diff <= 0) {
        newLabel = 'READY';
      } else {
        const activeFormat = config?.format ?? 'standard';
        const totalHours = diff / (1000 * 60 * 60);
        const totalDays = Math.floor(totalHours / 24);

        if (activeFormat === 'days' || totalHours > 72) {
          if (totalDays > 730) {
            const years = Math.floor(totalDays / 365);
            newLabel = `${years}y`;
          } else if (totalDays > 365) {
            const months = Math.floor(totalDays / 30);
            newLabel = `${months}m`;
          } else {
            newLabel = `${totalDays}d`;
          }
        } else {
          const h = Math.floor(totalHours);
          const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const s = Math.floor((diff % (1000 * 60)) / 1000);
          newLabel = `${h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
        }
      }

      setLabel(newLabel);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [date, config]);

  if (hideLabel || isOpened || !label) return null;

  const renderCurved = () => {
    const isReady = label === 'READY';
    if (!config || config.curvature === 0 || isReady) {
      return (
        <span style={{ 
          color: config?.color || '#fff', 
          fontFamily: 'monospace',
          fontWeight: 'bold',
          ...style 
        }}>
          {label}
        </span>
      );
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {label.split('').map((char, i, arr) => {
          const curve = config.curvature;
          const radius = 60 / (Math.abs(curve) || 1);
          const centerIdx = (arr.length - 1) / 2;
          const offset = i - centerIdx;
          const angle = offset * (curve * 0.1);
          const translateY = (Math.cos(angle) - 1) * radius * (curve > 0 ? 1 : -1);

          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                color: config.color,
                fontFamily: 'monospace',
                fontWeight: 'bold',
                transform: `rotate(${angle}rad) translateY(${translateY}px)`,
                ...style
              }}
            >
              {char}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="live-timer-web">
      {renderCurved()}
    </div>
  );
};

export default LiveTimer;
