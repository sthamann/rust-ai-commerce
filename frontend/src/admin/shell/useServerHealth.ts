/** Public server health is independent of the personal Studio session. */
import { useEffect, useState } from "react";
export function useServerHealth() {
  const [serverReady, setServerReady] = useState(false);
  useEffect(() => {
    let active = true;
    const check = () =>
      fetch("/health")
        .then((r) => {
          if (active) setServerReady(r.ok);
        })
        .catch(() => {
          if (active) setServerReady(false);
        });
    void check();
    const timer = setInterval(() => void check(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return serverReady;
}
