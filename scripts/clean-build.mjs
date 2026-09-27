#!/usr/bin/env node
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Always remove this checkout's build output, regardless of the caller's cwd.
// Do not resolve symlinks: removing a linked dist must not remove its target.
const output = fileURLToPath(new URL("../dist", import.meta.url));
rmSync(output, { recursive: true, force: true });
