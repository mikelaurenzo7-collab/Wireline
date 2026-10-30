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

## Android CLI & Local Emulator Setup

The Android CLI provides verified virtual device management, layout inspection, and screen automation directly on Windows.

### 1. Installation & Environment Verification

The Android CLI binary is installed at:
- Binary: `C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe`
- Android SDK: `C:\Users\MichaelLaurenzo\AppData\Local\Android\Sdk`

To verify the installation and environment:
```powershell
# Check Android CLI version and launcher status
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" --version

# Print SDK location and environment diagnostics
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" info
```

### 2. Emulator Creation & Management

Manage Android Virtual Devices (AVDs) directly through the CLI:

```powershell
# List available hardware and form-factor device profiles
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" emulator create --list-profiles
# Supported profiles: medium_phone, small_phone, medium_tablet, desktop

# Create a phone virtual device (recommended default: medium_phone)
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" emulator create medium_phone

# List created virtual devices
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" emulator list

# Launch the emulator (returns when the device is fully booted and ready)
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" emulator start

# Stop the running virtual device
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" emulator stop
```

---

## Layout Verification & Screen Automation

Inspect active application element hierarchies and capture annotated screen artifacts for automated testing:

### 1. Layout Tree Inspection (`android layout`)

```powershell
# Hierarchical UI tree in pretty-printed JSON:
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" layout --pretty

# Flat element list (useful for quick resource ID and text searches):
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" layout --flat

# Full component tree including non-interactive and background containers:
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" layout --full --pretty
```

### 2. Screen Capture & ADB Automation (`android screen`)

```powershell
# Visual screen capture with annotated element bounding boxes:
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" screen capture --annotate --output artifacts/mobile-screen.png

# Forward tap actions to specific annotated bounding boxes:
adb shell $(android screen resolve --screenshot artifacts/mobile-screen.png --string "input tap #1")
```

---

## Local Execution Workflow

Follow this workflow to run and debug the Flutter application locally:

```powershell
# 1. Switch to mobile app directory
Set-Location "apps\mobile"

# 2. Ensure dependencies are resolved
flutter pub get

# 3. Verify running emulator target
flutter devices

# 4. Run application with hot-reload enabled
flutter run -d <emulator-id>

# 5. Inspect live screen layout
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" layout --pretty
```

---

## Tooling & Antigravity Sidecar Integration

### 1. Android Device Hub Sidecar (`/android-device-hub`)
The Android Device Hub sidecar enables live low-latency screen mirroring and remote control in the Antigravity Device Hub pane:
```powershell
# Start Device Hub sidecar
& "C:\Users\MichaelLaurenzo\AppData\AndroidCLI\android.exe" sidecar run device-hub
```
- Open the **Android Device Hub** pane in Antigravity to see running emulators and attached physical devices.
- Click **Mirror** to watch the live display with touch, keyboard, and mouse forwarding.

### 2. Audio & In-House Voice Engine Bridge
Connects to BotBound's server-side Kokoro-82M voice synthesis engine in `src/lib/voice/clone-engines.ts`:
- Generates 24kHz linear PCM audio chunks with sub-120ms token-to-speech latency on CPU.
- Real-time dispatcher call monitoring and owner voice playback without third-party ElevenLabs dependencies or external API fees.
- Strict compliance with Illinois BIPA (740 ILCS 14/) and Texas CUBI (Tex. Bus. & Com. Code Sec. 503.001) with a 3-year maximum retention limit and automated retention sweeps.
