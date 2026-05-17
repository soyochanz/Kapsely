import React from 'react';

interface VerifiedBadgeProps {
  size?: number;
  style?: React.CSSProperties;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({ size = 18, style }) => {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const radius = s * 0.48;
  const innerRadius = radius * 0.88;
  const hex = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
  }).join(' ');
  const innerHex = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + innerRadius * Math.cos(angle)},${cy + innerRadius * Math.sin(angle)}`;
  }).join(' ');
  const strokeWidth = Math.max(1.4, s * 0.13);

  return (
    <span
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        filter: `drop-shadow(0 1px ${size * 0.22}px rgba(124, 58, 237, 0.6))`,
        ...style
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
        <defs>
          <linearGradient id={`web-vgrad-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6d28d9" />
            <stop offset="55%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id={`web-shine-${size}`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={hex} fill={`url(#web-vgrad-${size})`} />
        <polygon points={hex} fill={`url(#web-shine-${size})`} />
        <polygon points={innerHex} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
        <path
          d={`M${cx - s * 0.17} ${cy + s * 0.01} L${cx - s * 0.02} ${cy + s * 0.16} L${cx + s * 0.20} ${cy - s * 0.13}`}
          fill="none"
          stroke="#fff"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};

export default VerifiedBadge;
