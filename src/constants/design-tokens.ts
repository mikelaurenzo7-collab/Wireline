// Ametrine Design Tokens Strategy v2
// Layers: Primitive → Semantic → Component
// Single source of truth. Easy to extend. Supports themes + native.

export const TOKENS = {
  color: { /* ... */ },
  spacing: { base: 4, scale: 'multiples + fluid' },
  typography: { /* fluid scales */ },
  radius: { sm: '4px', md: '8px', lg: '12px' },
  motion: { /* easing + durations */ },
  // Strategy: Hybrid manual + future Style Dictionary compatible
  philosophy: 'Precision first, delight second, Ametrine supremacy'
};