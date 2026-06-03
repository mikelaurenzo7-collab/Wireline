with open("src/lib/workspace-planner.ts", "r") as f:
    content = f.read()

content = content.replace(
    '| "slack_channel_id";',
    '| "slack_channel_id"\n  | "name"\n  | "auto_zoom_link"\n  | "autonomy_level";'
)

content = content.replace(
    '| "slackChannelId";',
    '| "slackChannelId"\n    | "name"\n    | "autoZoomLink"\n    | "autonomyLevel";'
)

fields_to_add = """
  name: {
    column: "name",
    label: "Agent name",
    kind: "text",
    maxLen: 100,
  },
  auto_zoom_link: {
    column: "autoZoomLink",
    label: "Auto-generate Zoom links",
    kind: "boolean",
    maxLen: 5,
  },
  autonomy_level: {
    column: "autonomyLevel",
    label: "Autonomy level",
    kind: "text",
    maxLen: 20,
  },
"""

content = content.replace(
    'slack_channel_id: {\n    column: "slackChannelId",\n    label: "Slack channel ID",\n    kind: "text",\n    maxLen: 50,\n  },',
    'slack_channel_id: {\n    column: "slackChannelId",\n    label: "Slack channel ID",\n    kind: "text",\n    maxLen: 50,\n  },' + fields_to_add
)

with open("src/lib/workspace-planner.ts", "w") as f:
    f.write(content)
