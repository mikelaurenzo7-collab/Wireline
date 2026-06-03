import re

with open("src/lib/workspace-planner.ts", "r") as f:
    content = f.read()

# Add to WorkspaceFieldKey
content = content.replace(
    '| "escalation_phone";',
    '| "escalation_phone"\n  | "website_url"\n  | "archetype"\n  | "timezone"\n  | "email_auto_respond"\n  | "ambient_noise"\n  | "slack_channel_id";'
)

# Add to FieldSpec column
content = content.replace(
    '| "escalationPhone";',
    '| "escalationPhone"\n    | "websiteUrl"\n    | "archetype"\n    | "timezone"\n    | "emailAutoRespond"\n    | "ambientNoise"\n    | "slackChannelId";'
)

# Update kind
content = content.replace(
    'kind: "text" | "vibe" | "phone" | "email";',
    'kind: "text" | "vibe" | "phone" | "email" | "boolean" | "url";'
)

# Add to WORKSPACE_FIELDS
fields_to_add = """
  website_url: {
    column: "websiteUrl",
    label: "Website URL",
    kind: "url",
    maxLen: 200,
  },
  archetype: {
    column: "archetype",
    label: "Agent archetype",
    kind: "text",
    maxLen: 50,
  },
  timezone: {
    column: "timezone",
    label: "Timezone",
    kind: "text",
    maxLen: 50,
  },
  email_auto_respond: {
    column: "emailAutoRespond",
    label: "Email auto-respond",
    kind: "boolean",
    maxLen: 5,
  },
  ambient_noise: {
    column: "ambientNoise",
    label: "Ambient noise",
    kind: "text",
    maxLen: 20,
  },
  slack_channel_id: {
    column: "slackChannelId",
    label: "Slack channel ID",
    kind: "text",
    maxLen: 50,
  },
"""

content = content.replace(
    'escalation_phone: {\n    column: "escalationPhone",\n    label: "Escalation phone number",\n    kind: "phone",\n    maxLen: 20,\n  },',
    'escalation_phone: {\n    column: "escalationPhone",\n    label: "Escalation phone number",\n    kind: "phone",\n    maxLen: 20,\n  },' + fields_to_add
)

# Also update the prompt description for config_changes.value
content = content.replace(
    'The exact new value. For personality_vibe use one of: warm, playful, authoritative.',
    'The exact new value. For personality_vibe use one of: warm, playful, authoritative. For booleans, use "true" or "false".'
)

with open("src/lib/workspace-planner.ts", "w") as f:
    f.write(content)
