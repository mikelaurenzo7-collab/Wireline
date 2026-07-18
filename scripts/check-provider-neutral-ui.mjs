import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  console.error(`Provider-neutral UI check failed: ${message}`);
  process.exitCode = 1;
};

const routes = read("src/routes/AppRoutes.tsx");
const knowledgePage = read("src/pages/KnowledgePage.tsx");
const callLogsPage = read("src/pages/CallLogsPage.tsx");
const phoneHistory = read("src/components/PhoneCallHistoryPanel.tsx");
const recipes = read("src/components/Recipes.tsx");
const recipeButton = read("src/components/recipes/RecipeButton.tsx");
const legacyRecipes = read("src/components/ClaudeRecipes.tsx");
const legacyRecipeButton = read("src/components/recipes/ClaudeRecipeButton.tsx");

if (!routes.includes('import("../pages/AgentStudioHome")'))
  fail("authenticated Studio route is not using AgentStudioHome");
if (routes.includes("AgentStudioHomeClaude"))
  fail("authenticated Studio route still imports the legacy provider-named module");

if (!knowledgePage.includes('from "../components/KnowledgeBase"'))
  fail("Knowledge page is not using the provider-neutral KnowledgeBase module");
if (knowledgePage.includes("KnowledgeBaseClaude"))
  fail("Knowledge page still imports or renders the legacy provider-named component");

for (const [path, source] of [
  ["src/pages/CallLogsPage.tsx", callLogsPage],
  ["src/components/PhoneCallHistoryPanel.tsx", phoneHistory],
]) {
  if (!source.includes('from "../components/CallLogs"') && !source.includes('from "./CallLogs"'))
    fail(`${path} is not using the provider-neutral CallLogs module`);
  if (source.includes("CallLogsClaude"))
    fail(`${path} still imports or renders the legacy provider-named component`);
}

if (!recipes.includes('export { RecipeButton } from "./recipes/RecipeButton"'))
  fail("Recipes barrel does not expose the provider-neutral RecipeButton");
if (!recipeButton.includes("export function RecipeButton"))
  fail("provider-neutral RecipeButton implementation is missing");

if (!legacyRecipes.includes("@deprecated") || legacyRecipes.length > 500)
  fail("legacy ClaudeRecipes entrypoint must remain a small compatibility alias only");
if (!legacyRecipeButton.includes("@deprecated") || legacyRecipeButton.length > 300)
  fail("legacy ClaudeRecipeButton entrypoint must remain a small compatibility alias only");

if (!process.exitCode) console.log("Provider-neutral UI check passed.");
