/**
 * Claude Recipes — barrel.
 *
 * The original 2,862-line monolith was sliced into a `recipes/`
 * folder. This file stays at the original import path so every
 * `import { ClaudeRecipeButton } from "./ClaudeRecipes"` (or
 * `RecipeModal`, or `Recipe`) keeps working with zero migration.
 *
 * If you're touching a recipe form, edit the file under
 * `src/components/recipes/forms/*` directly — this file should
 * never grow logic again.
 */

export { ClaudeRecipeButton } from "./recipes/ClaudeRecipeButton";
export { RecipeModal } from "./recipes/RecipeModal";
export type { Recipe } from "./recipes/types";
