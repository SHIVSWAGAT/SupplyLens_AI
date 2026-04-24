import { useEffect, useState } from "react";

export function useAnimatedNumber(value, duration = 700) {
  const [displayValue, setDisplayValue] = useState(Number(value || 0));

  useEffect(() => {
    const target = Number(value || 0);
    const start = displayValue;
    const startTime = performance.now();

    let frameId = 0;

    const tick = (time) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const nextValue = start + (target - start) * progress;
      setDisplayValue(nextValue);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [duration, value]);

  return displayValue;
}
