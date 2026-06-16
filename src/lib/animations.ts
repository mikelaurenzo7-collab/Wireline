import { Variants } from 'framer-motion';

/**
 * Wireline Animation System
 * Grok Certified - Precise, professional, accessible
 */

// Check for reduced motion preference
export const shouldReduceMotion = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Base fade in
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
  }
};

// Fade up (most common entrance)
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.25, ease: [0.23, 1, 0.32, 1] }
  }
};

// Stagger container for lists
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05
    }
  }
};

// Stagger item
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
  }
};

// Card hover interaction
export const cardHover = {
  whileHover: { 
    y: -3,
    transition: { duration: 0.15, ease: [0.23, 1, 0.32, 1] }
  },
  whileTap: { scale: 0.985 }
};

// Button press
export const buttonPress = {
  whileHover: { scale: 1.01 },
  whileTap: { scale: 0.985 }
};

// Modal / Dialog entrance
export const modalEnter: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 20 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
  },
  exit: { 
    opacity: 0, 
    scale: 0.96, y: 10,
    transition: { duration: 0.15 } 
  }
};

// Page transition (for route changes)
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.25, ease: [0.23, 1, 0.32, 1] }
  },
  exit: { 
    opacity: 0, y: -8,
    transition: { duration: 0.2 } 
  }
};

// Tab content transition
export const tabContent: Variants = {
  hidden: { opacity: 0, x: 8 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
  },
  exit: { opacity: 0, x: -8 }
};

// Status change (for live updates)
export const statusChange = {
  initial: { scale: 0.9, opacity: 0.6 },
  animate: { 
    scale: 1, 
    opacity: 1,
    transition: { type: 'spring', stiffness: 400, damping: 25 }
  }
};

// Helper to conditionally apply reduced motion
export const withReducedMotion = (variants: Variants) => {
  if (shouldReduceMotion()) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { duration: 0.01 } }
    };
  }
  return variants;
};

// Preset for list items with stagger
export const listItem = withReducedMotion(staggerItem);