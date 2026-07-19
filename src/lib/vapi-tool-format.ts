export type VapiFunctionDefinition = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type VapiFunctionTool = {
  type: "function";
  function: VapiFunctionDefinition;
};

/** Convert Wireline's role-filtered function definitions to Vapi's current tool DTO. */
export function toVapiFunctionTools(definitions: readonly object[]): VapiFunctionTool[] {
  const tools: VapiFunctionTool[] = [];

  for (const definition of definitions) {
    const raw = definition as {
      name?: unknown;
      description?: unknown;
      parameters?: unknown;
    };
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) continue;

    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    const parameters =
      raw.parameters && typeof raw.parameters === "object" && !Array.isArray(raw.parameters)
        ? (raw.parameters as Record<string, unknown>)
        : undefined;

    tools.push({
      type: "function",
      function: {
        name,
        ...(description ? { description } : {}),
        ...(parameters ? { parameters } : {}),
      },
    });
  }

  return tools;
}
