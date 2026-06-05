'use client';

import { useState } from 'react';

interface Props {
  src: string;
  name: string;
  size: number;
  className?: string;
  style?: React.CSSProperties;
}

const GRADIENT_PAIRS = [
  ['#8b5cf6', '#ec4899'],
  ['#3b82f6', '#06b6d4'],
  ['#f97316', '#f43f5e'],
  ['#22c55e', '#06b6d4'],
  ['#a855f7', '#8b5cf6'],
  ['#f59e0b', '#f97316'],
];

function getGradient(name: string): [string, string] {
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) ?? 0)) % GRADIENT_PAIRS.length;
  return GRADIENT_PAIRS[idx] as [string, string];
}

export default function Avatar({ src, name, size, className, style }: Props) {
  const [error, setError] = useState(false);
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?';
  const [from, to] = getGradient(name ?? '');

  if (error || !src) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${from}, ${to})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'inherit',
          flexShrink: 0,
          ...style,
        }}
      >
        <span
          style={{
            color: 'white',
            fontWeight: 700,
            fontSize: size * 0.42,
            lineHeight: 1,
            fontFamily: 'Poppins, sans-serif',
          }}
        >
          {initial}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      onError={() => setError(true)}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, ...style }}
      loading="lazy"
    />
  );
}
