import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation } from 'framer-motion';
import LiveTimer from './LiveTimer';
import { timerConfigManager } from '../utils/timerConfig';
import type { ModelTimerConfig, ModelChainConfig } from '../utils/timerConfig';

interface CapsuleWithTimerProps {
  modelKey: string;
  source: string;
  date: string;
  style?: React.CSSProperties;
  chainId?: string | null;
  configOverride?: ModelTimerConfig;
  chainConfigOverride?: ModelChainConfig;
  hideTimer?: boolean;
  isOpened?: boolean;
  hideParticles?: boolean;
  lightweight?: boolean;
  disableAnimations?: boolean;
}

const CapsuleWithTimer: React.FC<CapsuleWithTimerProps> = ({
  modelKey,
  source,
  date,
  style,
  chainId,
  configOverride,
  hideTimer,
  isOpened,
  hideParticles,
  chainConfigOverride,
  lightweight,
  disableAnimations,
}) => {
  const [configVersion, setConfigVersion] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const config = configOverride || timerConfigManager.getConfig(modelKey);
  const chainConfig = chainConfigOverride || (chainId ? timerConfigManager.getChainConfig(modelKey, chainId) : null);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    
    const unsubscribe = timerConfigManager.subscribe(() => setConfigVersion(v => v + 1));
    return () => {
      window.removeEventListener('resize', updateSize);
      unsubscribe();
    };
  }, []);

  const chainLibrary = timerConfigManager.getChainLibrary();
  const chainItem = chainId ? chainLibrary.find((c: any) => c.id === chainId) : null;

  const baseFontSize = Math.max(8, (size.height * config.h) * 0.55);

  return (
    <div 
      ref={containerRef}
      className="capsule-with-timer-web"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
    >
      {/* Ground Shadow */}
      {size.width > 0 && (
        <div style={{
          position: 'absolute',
          bottom: `-${size.width * 0.1}px`,
          width: `${size.width * 0.8}px`,
          height: `${size.width * 0.2}px`,
          background: 'rgba(0,0,0,0.15)',
          borderRadius: '50%',
          filter: 'blur(10px)',
          zIndex: 0,
          transform: 'scaleY(0.3)'
        }} />
      )}

      {/* Main Model Image */}
      <motion.img
        src={source}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          zIndex: 1,
          pointerEvents: 'none'
        }}
        animate={!disableAnimations && !lightweight ? {
          y: [0, -10, 0],
          rotate: [-1, 1, -1]
        } : {}}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      {/* Timer Overlay */}
      {size.width > 0 && !hideTimer && (
        <div style={{
          position: 'absolute',
          left: `${config.x * 100}%`,
          top: `${config.y * 100}%`,
          width: `${config.w * 100}%`,
          height: `${config.h * 100}%`,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          pointerEvents: 'none'
        }}>
          <LiveTimer
            date={date}
            modelId={modelKey}
            configOverride={config}
            style={{ fontSize: `${baseFontSize}px` }}
            isOpened={isOpened}
          />
          
          {/* Glint Effect */}
          {!disableAnimations && !lightweight && (
            <motion.div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                zIndex: 3
              }}
              animate={{
                x: ['-100%', '200%']
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 3,
                ease: "linear"
              }}
            />
          )}
        </div>
      )}

      {/* Chain Overlay */}
      {size.width > 0 && chainItem && chainConfig && (
        <div style={{
          position: 'absolute',
          left: `${chainConfig.x * 100}%`,
          top: `${chainConfig.y * 100}%`,
          width: `${chainConfig.scale * size.width}px`,
          height: `${chainConfig.scale * size.height}px`,
          transform: 'translate(-50%, -50%)',
          zIndex: 4,
          pointerEvents: 'none'
        }}>
          <motion.img
            src={chainItem.image_url}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              transformOrigin: 'top center'
            }}
            animate={!disableAnimations && !lightweight ? {
              rotate: [-3, 3, -3]
            } : {}}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </div>
      )}
    </div>
  );
};

export default CapsuleWithTimer;
