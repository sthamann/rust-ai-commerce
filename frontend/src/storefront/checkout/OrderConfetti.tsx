/** Finite CSS celebration after an accepted order; no timers, libraries or motion for reduced-motion users. */
import type { CSSProperties } from "react";
export default function OrderConfetti() {
  return (
    <div className="order-confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, n) => (
        <i
          key={n}
          style={
            {
              "--x": `${(n * 37) % 100}%`,
              "--delay": `${(n % 6) * 0.08}s`,
              "--drift": `${(n % 2 ? 1 : -1) * (40 + n * 3)}px`,
              "--turn": `${180 + n * 27}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
