import React from 'react';

export function FrostplowTitleEmblem() {
  return (
    <svg
      viewBox="0 0 420 118"
      className="w-full max-w-[400px] h-auto drop-shadow-[0_10px_24px_rgba(6,12,24,0.85)]"
      role="img"
      aria-label="Frostplow: Cozy Alpine Brigade"
    >
      {/* Outer Timber & Brass Plaque Silhouette */}
      <path
        d="M18 14 L402 14 L414 32 L404 94 L388 106 L32 106 L16 94 L6 32 Z"
        fill="#132238"
        stroke="#f59e0b"
        strokeWidth="3.5"
      />
      {/* Inner Warm Alpine Wood Inset */}
      <path
        d="M24 20 L396 20 L406 34 L397 88 L384 99 L36 99 L23 88 L14 34 Z"
        fill="#1e324d"
        stroke="#38bdf8"
        strokeWidth="1.5"
        strokeOpacity="0.45"
      />
      {/* Top Snow Cap Ridge Detail */}
      <path
        d="M22 14 Q65 24 105 15 Q160 26 215 15 Q275 25 335 15 Q372 22 400 14"
        fill="none"
        stroke="#f8fafc"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Left V-Plow Blade Crest Icon */}
      <g transform="translate(30, 34)">
        <path
          d="M4 8 L28 2 L36 26 L12 36 Z"
          fill="#f59e0b"
          stroke="#0f172a"
          strokeWidth="2.5"
        />
        <path
          d="M8 12 L25 7 L30 22 L14 29 Z"
          fill="#fde68a"
        />
        <circle cx="30" cy="34" r="8" fill="#e64833" stroke="#0f172a" strokeWidth="2.5" />
      </g>
      {/* Main Display Lettering */}
      <text
        x="82"
        y="64"
        fill="#f8fafc"
        stroke="#091322"
        strokeWidth="5"
        paintOrder="stroke fill"
        fontFamily="Outfit, sans-serif"
        fontWeight="800"
        fontSize="44"
        letterSpacing="2"
      >
        FROSTPLOW
      </text>
      {/* Subtitle Kicker */}
      <text
        x="84"
        y="88"
        fill="#fbbf24"
        fontFamily="Plus Jakarta Sans, sans-serif"
        fontWeight="700"
        fontSize="13"
        letterSpacing="3.5"
      >
        COZY ALPINE BRIGADE
      </text>
    </svg>
  );
}

export function WarmthCocoaPip({ state }: { state: 'full' | 'cracked' | 'empty' }) {
  const isFull = state === 'full';
  const isCracked = state === 'cracked';
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-6 h-6 shrink-0"
      aria-hidden="true"
    >
      {/* Cup Handle */}
      <path
        d="M17 8 H19.5 A2.5 2.5 0 0 1 22 10.5 V13.5 A2.5 2.5 0 0 1 19.5 16 H17"
        fill="none"
        stroke="#0b1322"
        strokeWidth="3.5"
      />
      <path
        d="M17 8 H19.5 A2.5 2.5 0 0 1 22 10.5 V13.5 A2.5 2.5 0 0 1 19.5 16 H17"
        fill="none"
        stroke={isFull ? '#fbbf24' : isCracked ? '#f97316' : '#334155'}
        strokeWidth="2"
      />
      {/* Mug Outer Silhouette */}
      <rect
        x="4"
        y="6"
        width="13"
        height="14"
        rx="3"
        fill={isFull ? '#e64833' : isCracked ? '#7c2d12' : '#1e293b'}
        stroke="#0b1322"
        strokeWidth="2.2"
      />
      {/* Top Cream Foam Highlight */}
      {isFull && (
        <>
          <rect x="5.5" y="7.5" width="10" height="3.2" rx="1.2" fill="#fef3c7" />
          <path d="M8 3.5 Q9 1.5 10 3.5" stroke="#fde68a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M13 3.5 Q14 1.5 15 3.5" stroke="#fde68a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function CoinIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="#f59e0b" stroke="#0b1322" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="6.8" fill="#fbbf24" stroke="#b45309" strokeWidth="1.2" />
      <path d="M12 7.5 L13.8 11 L17 12 L13.8 13 L12 16.5 L10.2 13 L7 12 L10.2 11 Z" fill="#fef3c7" />
    </svg>
  );
}

export function CabinIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 12 L12 4 L21 12" fill="none" stroke="#0b1322" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 11.5 V20 H19 V11.5" fill="#7c4a27" stroke="#0b1322" strokeWidth="2.2" />
      <path d="M3 12 L12 4 L21 12" fill="none" stroke="#f8fafc" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="9.5" y="13" width="5" height="5" rx="0.8" fill="#fde047" stroke="#0b1322" strokeWidth="1.5" />
    </svg>
  );
}

export function UpgradeIcon({ id }: { id: 'bladeWidth' | 'engineTorque' | 'saltMelter' | 'hopperBounty' }) {
  if (id === 'bladeWidth') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
        <path d="M3 7 L12 4 L21 7 L19 18 L12 15 L5 18 Z" fill="#f59e0b" stroke="#0b1322" strokeWidth="2" />
        <path d="M6 10 L12 8 L18 10" fill="none" stroke="#fef3c7" strokeWidth="1.8" />
      </svg>
    );
  }
  if (id === 'engineTorque') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
        <path d="M13 3 L5 14 H12 L11 21 L19 10 H12 Z" fill="#38bdf8" stroke="#0b1322" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === 'saltMelter') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="#fb7185" stroke="#0b1322" strokeWidth="2" />
        <path d="M12 6 V18 M6 12 H18 M8 8 L16 16 M16 8 L8 16" stroke="#fff1f2" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
      <path d="M5 6 H19 L16 19 H8 Z" fill="#fbbf24" stroke="#0b1322" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 9 H16" stroke="#fef3c7" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
