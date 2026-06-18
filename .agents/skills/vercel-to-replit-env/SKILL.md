---
name: vercel-to-replit-env
description: Syncs environment variables from Vercel to a format suitable for Replit using the Vercel CLI.
---

# Vercel to Replit Environment Sync

When the user asks to sync or pull Vercel environment variables for Replit:
1. **Check for Token**: Ask the user for their `VERCEL_TOKEN` if not already provided in the prompt or environment.
2. **Execute Pull**: Run `cmd.exe /c npx vercel env pull .env.replit --yes --token <VERCEL_TOKEN>` in the project root.
3. **Format**: Once pulled, read the `.env.replit` file and present it to the user either as a downloadable artifact or directly in a code block so they can easily paste it into Replit.
