'use client';

/**
 * The mark is a coin split down the middle — one half solid, one half
 * carved away — which is the whole product in one shape.
 */
export function LogoMark({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="splitta-g" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--lav-400)" />
          <stop offset="1" stopColor="var(--lav-600)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill="url(#splitta-g)" />
      <path d="M16 6.5a9.5 9.5 0 0 0 0 19V6.5Z" fill="#ffffff" fillOpacity="0.96" />
      <path
        d="M16 6.5a9.5 9.5 0 0 1 0 19"
        stroke="#ffffff"
        strokeOpacity="0.92"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="15.1" y="3.6" width="1.9" height="24.8" rx="0.95" fill="url(#splitta-g)" />
    </svg>
  );
}

export default function Logo({ size = 32, showText = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {showText && (
        <span className="newq  text-ink" style={{ fontSize: size * 0.62 }}>
          Splitta
        </span>
      )}
    </span>
  );
}
