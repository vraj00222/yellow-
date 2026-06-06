/** The Yellow eye — a black eye on the signal-yellow tile. Watches the backend. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="brand__mark" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <rect width="120" height="120" rx="28" fill="#FFD60A" />
        <path
          d="M22 60 Q60 28 98 60 Q60 92 22 60 Z"
          stroke="#0B0B0C"
          strokeWidth="6"
          strokeLinejoin="round"
        />
        <circle cx="60" cy="60" r="17" fill="#0B0B0C" />
        <rect x="54.5" y="54.5" width="11" height="11" rx="2.5" fill="#FFD60A" />
      </svg>
    </span>
  );
}
