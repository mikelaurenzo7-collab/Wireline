import { useEffect, useRef, useState } from "react";

const IS_IOS_SAFARI =
  typeof navigator !== "undefined" &&
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  /AppleWebKit/.test(navigator.userAgent) &&
  !/CriOS/.test(navigator.userAgent) &&
  !/FxiOS/.test(navigator.userAgent);

export function useVisualViewport(): {
  height: number | null;
  offsetTop: number | null;
} {
  const [height, setHeight] = useState<number | null>(null);
  const [offsetTop, setOffsetTop] = useState<number | null>(null);
  const vvRef = useRef(typeof window !== "undefined" ? window.visualViewport : undefined);

  useEffect(() => {
    const vv = vvRef.current;
    if (!vv || !IS_IOS_SAFARI) return;

    const handler = () => {
      setHeight(vv.height);
      setOffsetTop(vv.offsetTop);
    };

    handler();
    vv.addEventListener("resize", handler);
    vv.addEventListener("scroll", handler);

    return () => {
      vv.removeEventListener("resize", handler);
      vv.removeEventListener("scroll", handler);
    };
  }, []);

  return { height, offsetTop };
}
