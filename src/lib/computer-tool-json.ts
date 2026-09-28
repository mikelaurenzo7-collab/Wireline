/** Pure shared boundary for untrusted tool schemas and arguments. Ajv stays in the local client. */
export function assertBoundedToolJson(value: unknown, schema = false): void {
  type Context = "schema" | "map" | "array" | "dependencies" | "data";
  const schemaMaps = new Set(["properties", "$defs", "definitions", "dependentSchemas"]);
  const schemaArrays = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
  const singleSchemas = new Set([
    "additionalProperties",
    "unevaluatedProperties",
    "propertyNames",
    "additionalItems",
    "contains",
    "not",
    "if",
    "then",
    "else",
    "unevaluatedItems",
    "contentSchema",
  ]);
  let nodes = 0;
  const references: Array<{ path: string; resource: unknown }> = [];
  const checkedSchemas = new WeakMap<object, Set<unknown>>();
  const resources = new WeakMap<object, unknown>();
  const walk = (item: unknown, depth: number, context: Context, resource: unknown): void => {
    if (++nodes > 4000 || depth > 16) throw new Error("Tool JSON is too complex.");
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (
      !item ||
      typeof item !== "object" ||
      (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)
    )
      throw new Error("Tool data must be plain JSON.");
    if (context === "schema") {
      // A nested $id establishes a separate local-reference resource.
      if (typeof (item as Record<string, unknown>).$id === "string") resource = item;
      const checkedResources = checkedSchemas.get(item) ?? new Set<unknown>();
      if (checkedResources.has(resource)) return;
      checkedResources.add(resource);
      checkedSchemas.set(item, checkedResources);
    }
    resources.set(item, resource);
    for (const [key, child] of Object.entries(item)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("Unsafe tool data property.");
      // Only actual schema keywords compile regex. Property names and literals do not.
      if (
        context === "schema" &&
        (["pattern", "patternProperties"].includes(key) || (key === "format" && child === "regex"))
      )
        throw new Error(
          "This tool uses an unsupported regular-expression schema. Choose a simpler tool schema.",
        );
      if (context === "schema" && (key === "$ref" || key === "$dynamicRef")) {
        if (typeof child !== "string" || !child.startsWith("#/"))
          throw new Error(
            "Remote schema references are not supported; tool schemas cannot load remote references.",
          );
        references.push({ path: child, resource });
      }
      let next: Context = "data";
      if (context === "map" || context === "array") next = "schema";
      else if (context === "dependencies") next = Array.isArray(child) ? "data" : "schema";
      else if (context === "schema") {
        if (schemaMaps.has(key)) next = "map";
        else if (schemaArrays.has(key)) next = "array";
        else if (singleSchemas.has(key)) next = "schema";
        else if (key === "items") next = Array.isArray(child) ? "array" : "schema";
        else if (key === "dependencies") next = "dependencies";
      }
      walk(child, depth + 1, next, resource);
    }
  };
  walk(value, 0, schema ? "schema" : "data", value);
  if (JSON.stringify(value).length > 24_000) throw new Error("Tool JSON is too large.");
  // A local reference can promote otherwise inert annotation data into a schema.
  // Check those targets too, without recursing forever through recursive schemas.
  for (let index = 0; index < references.length; index++) {
    let target: unknown = references[index].resource;
    for (const part of decodeURIComponent(references[index].path.slice(2)).split("/")) {
      const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
      if (!target || typeof target !== "object" || !Object.hasOwn(target, key)) {
        target = undefined;
        break;
      }
      target = (target as Record<string, unknown>)[key];
    }
    if (target !== undefined)
      walk(
        target,
        0,
        "schema",
        target && typeof target === "object"
          ? (resources.get(target) ?? references[index].resource)
          : references[index].resource,
      );
  }
}
