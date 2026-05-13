import { existsSync, statSync, chmodSync } from "fs";
import path from "path";
import process from "process";

const helperPath = path.resolve(
  process.cwd(),
  "node_modules",
  "node-pty",
  "prebuilds",
  `${process.platform}-${process.arch}`,
  "spawn-helper"
);

try {
  if (existsSync(helperPath)) {
    const currentMode = statSync(helperPath).mode;
    if ((currentMode & 0o111) === 0) {
      chmodSync(helperPath, currentMode | 0o755);
    }
  }
} catch (error) {
  console.warn("[node-pty] failed to ensure spawn-helper permissions", error?.message || error);
}
