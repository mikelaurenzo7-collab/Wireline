# BotBound Unified Mobile (Flutter)

Cross-platform mobile companion application for **BotBound**, providing on-the-road dispatchers, field technicians, and small business owners with real-time AI voice oversight, lead alerts, and cloud computer takeover controls.

---

## Architecture & Design Tokens

`botbound_mobile` uses the **BotBound Clear System** dark design tokens. Tokens are auto-generated from `design-tokens/wireline.tokens.json` directly into Dart:

```bash
# Rebuild design tokens across Web, iOS, Android, and Flutter:
node scripts/build-design-tokens.mjs
```

Target file: `lib/theme/wireline_tokens.generated.dart`
- Primary Action: Aurora Violet (`#A78BFA` / `Color(0xFFA78BFA)`)
- Canvas: Deep Obsidian (`#0A0A0E` / `Color(0xFF0A0A0E)`)
- Surface: Dark Zinc (`#141319` / `Color(0xFF141319)`)

---

## Tooling & Antigravity Sidecar Integration

### 1. Android Device Hub Sidecar (`/android-device-hub`)
The Android Device Hub sidecar enables live low-latency screen mirroring and remote control in the Antigravity Device Hub pane:
```bash
# Start Device Hub sidecar
android sidecar run device-hub
```
- Open the **Android Device Hub** pane in Antigravity to see running emulators and attached physical devices.
- Click **Mirror** to watch the live display with touch, keyboard, and mouse forwarding.

### 2. Android CLI (`/android-cli`)
Use the `android` CLI tool to inspect the mobile screen layout and capture visual evidence:
```bash
# Text-based layout inspection (hierarchical tree of UI elements, resource IDs, bounds):
android layout --pretty

# Visual screen capture with annotated element bounding boxes:
android screen capture --annotate --output artifacts/mobile-screen.png

# Forward tap actions to specific annotated bounding boxes:
adb shell $(android screen resolve --screenshot artifacts/mobile-screen.png --string "input tap #1")
```

### 3. Audio & Voice Bridge
Connects to BotBound's in-house voice engine and Gemini 3.8 Live media bridge for sub-150ms real-time call monitoring and owner voice playback without third-party ElevenLabs dependencies.
