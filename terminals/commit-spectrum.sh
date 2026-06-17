#!/usr/bin/env bash
export PATH="/c/Users/MichaelLaurenzo/AppData/Local/Programs/nodejs/node-v20.19.0-win-x64:/c/Users/MichaelLaurenzo/Downloads/Wireline-2/node_modules/.bin:$PATH"
cd /c/Users/MichaelLaurenzo/Downloads/Wireline-2

git add \
  src/lib/api.ts \
  src/constants/navigation.ts \
  src/lib/director-design-ensemble.test.ts \
  src/lib/director-design-ensemble.ts \
  src/lib/director-design-imagine.ts \
  src/lib/director-design-jury.test.ts \
  src/lib/director-design-jury.ts \
  src/lib/director-design-orchestrator.test.ts \
  src/lib/director-design-orchestrator.ts \
  src/lib/director-design-prompts.ts \
  src/lib/director-design-team.test.ts \
  src/lib/director-design-team.ts \
  src/lib/openrouter-structured.ts \
  src/lib/wireline-director-design.test.ts \
  src/lib/wireline-director-design.ts

git commit -m "Replace Pacific tournament with Spectrum Desk Design Studio.

Use OpenRouter-ranked linear pipeline: Step layout, Qwen build, Sonnet
critique, MiniMax M3 finish, Gemini hero images, and optional Hy3
challenger only when pass-1 quality gate fails. Drops architect voting
to cut latency; keeps Design Studio in Chat (no sidebar page yet)."

git push origin main
