import { spawn } from "node:child_process";
import http from "node:http";
import { findFreePort } from "./find-free-port.mjs";

const port = await findFreePort(Number(process.env.VITE_PORT || 5173));
const devServerUrl = `http://127.0.0.1:${port}`;

const env = {
  ...process.env,
  VITE_PORT: String(port),
  VITE_DEV_SERVER_URL: devServerUrl
};

let vite;
let electron;
let shuttingDown = false;

function spawnCommand(command, args) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env
  });
}

function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function check() {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(check, 250);
      });

      request.setTimeout(1000, () => {
        request.destroy();
      });
    }

    check();
  });
}

function cleanup() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (vite && !vite.killed) {
    vite.kill();
  }
  if (electron && !electron.killed) {
    electron.kill();
  }
}

console.log(`[dev] Vite port: ${port}`);
console.log(`[dev] Vite URL: ${devServerUrl}`);

vite = spawnCommand("npm", ["run", "dev:vite"]);

vite.on("exit", (code) => {
  if (!shuttingDown) {
    cleanup();
    process.exit(code ?? 1);
  }
});

try {
  await waitForServer(devServerUrl);
  electron = spawnCommand("npm", ["run", "dev:electron"]);
} catch (error) {
  console.error(`[dev] ${error.message}`);
  cleanup();
  process.exit(1);
}

electron.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
