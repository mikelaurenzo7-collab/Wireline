import { useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { getRouteAccentFromLocation } from "../../constants/navigation";

/**
 * Soft route-tinted glow behind page content — ties each surface to the
 * Wireline purple → accent gradient without competing with data UI.
 */
export default function ClientRouteAmbience() {
  const { pathname, search } = useLocation();
  const [from, to] = getRouteAccentFromLocation(pathname, search);
  const key = `${pathname}${search}`;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden -z-10"
      aria-hidden="true"
      data-route-from={from}
      data-route-to={to}
    >
      <motion.div
        key={key}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="absolute -top-[18%] -right-[12%] w-[min(72vw,520px)] h-[min(72vw,520px)] rounded-full blur-3xl wl-route-ambience-a"
      />
      <motion.div
        key={`${key}-b`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.85, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        className="absolute -bottom-[22%] -left-[8%] w-[min(58vw,420px)] h-[min(58vw,420px)] rounded-full blur-3xl wl-route-ambience-b"
      />
      <div className="absolute inset-x-0 top-0 h-24 opacity-60 wl-route-ambience-top" />
    </div>
  );
}
