import { useReducedMotion } from "motion/react";

export function useAnimationConfig() {
  const reduceMotion = useReducedMotion();
  
  return {
    motionProps: reduceMotion ? {
      initial: false,
      animate: false,
      exit: false,
      transition: { duration: 0.01 },
      whileHover: {},
      whileTap: {},
    } : {},
    
    reduceMotion,
    
    pageTransition: reduceMotion ? {
      duration: 0.01,
    } : {
      duration: 0.35,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  };
}
