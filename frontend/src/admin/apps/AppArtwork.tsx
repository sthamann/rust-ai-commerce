/** Passive app artwork with independent failed-image fallbacks and deterministic local category covers. */
import { useState, useId, type CSSProperties } from "react";
import Icon from "../../shared/ui/Icon";
import { appIcon, artworkSource } from "./library-model";
export default function AppArtwork({
  id,
  category,
  icon,
  cover,
  compact = false,
}: {
  id: string;
  category: string;
  icon?: string;
  cover?: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const gid = useId();
  const src = artworkSource(cover),
    logo = artworkSource(icon);
  const seed = [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return (
    <div
      className={`app-artwork ${compact ? "app-artwork-compact" : ""}`}
      data-category={category}
      style={{ "--app-rotation": `${(seed % 28) - 14}deg` } as CSSProperties}
      aria-hidden="true"
    >
      {!compact &&
        (src && !failed.includes(src) ? (
          <img
            className="app-cover-image"
            src={src}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed((v) => [...v, src])}
          />
        ) : (
          <svg
            className="app-cover-vector"
            viewBox="0 0 480 180"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient id={gid} x2="1" y2="1">
                <stop stopColor="currentColor" stopOpacity=".05" />
                <stop offset="1" stopColor="currentColor" stopOpacity=".25" />
              </linearGradient>
            </defs>
            <rect width="480" height="180" fill={`url(#${gid})`} />
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity=".22"
            >
              <circle cx={340 + (seed % 45)} cy="70" r="78" />
              <circle cx={340 + (seed % 45)} cy="70" r="105" />
              <rect
                x="230"
                y="-15"
                width="145"
                height="210"
                rx="32"
                transform={`rotate(${(seed % 40) - 20} 310 80)`}
              />
              <path d="M30 150h140m-70-70v140M410 10v150" />
            </g>
          </svg>
        ))}
      <span className="app-logo">
        {logo && !failed.includes(logo) ? (
          <img
            src={logo}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed((v) => [...v, logo])}
          />
        ) : (
          <Icon name={appIcon(id, category)} size={compact ? 25 : 36} />
        )}
      </span>
    </div>
  );
}
