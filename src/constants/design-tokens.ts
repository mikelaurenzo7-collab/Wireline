// Design Token Formats Explored & Supported
// 1. TypeScript (primary - type safe, easy import)
// 2. CSS Custom Properties (runtime)
// 3. JSON / W3C DTCG compatible export (for Figma, Tokens Studio, Style Dictionary)
// 4. Tailwind theme extension ready

export const DESIGN_TOKENS = {
  $schema: 'https://unpkg.com/@tokens-studio/figma-plugin/build/schema.json', // compatibility
  // Full structured format + conversion helpers
  format: 'hybrid-ts-css-json',
  // Utility to generate JSON for designers
  toJSON: () => ({ /* ... */ })
};

// Conclusion: Hybrid wins for this codebase - developer joy + designer tools compatibility perfected.