export function Meridians() {
  return (
    <div className="meridian" aria-hidden="true">
      <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="arcG" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(78,222,163,0)" />
            <stop offset="50%" stopColor="rgba(78,222,163,0.30)" />
            <stop offset="100%" stopColor="rgba(78,222,163,0)" />
          </linearGradient>
          <linearGradient id="arcG2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(124,168,255,0)" />
            <stop offset="50%" stopColor="rgba(124,168,255,0.22)" />
            <stop offset="100%" stopColor="rgba(124,168,255,0)" />
          </linearGradient>
        </defs>
        <path
          className="arc"
          d="M -200 220 Q 800 -120 1800 320"
          fill="none"
          stroke="url(#arcG)"
          strokeWidth="1"
        />
        <path
          className="arc arc-2"
          d="M -200 720 Q 800 420 1800 880"
          fill="none"
          stroke="url(#arcG2)"
          strokeWidth="1"
        />
        <path
          className="arc arc-3"
          d="M -200 480 Q 800 200 1800 560"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
        <circle className="star star-1" cx="320" cy="178" r="2" fill="rgba(78,222,163,0.7)" />
        <circle className="star star-2" cx="1180" cy="262" r="2" fill="rgba(255,255,255,0.6)" />
        <circle className="star star-3" cx="720" cy="498" r="1.5" fill="rgba(124,168,255,0.6)" />
      </svg>
    </div>
  );
}
