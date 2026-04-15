import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const debugFlags = new Set(["--debug-loopback", "--debug-local-asr", "--debug-asr"]);
const debugDisabledFlags = new Set(["--no-debug-loopback", "--no-debug-local-asr", "--no-debug-asr"]);
const viteArgs = [];
let debugLoopback = process.env.VITE_ASR_CLIENT_DEBUG === "1";

for (const arg of args) {
  if (debugFlags.has(arg)) {
    debugLoopback = true;
    continue;
  }
  if (debugDisabledFlags.has(arg)) {
    debugLoopback = false;
    continue;
  }
  viteArgs.push(arg);
}

const viteBin = process.platform === "win32" ? "node_modules/.bin/vite.cmd" : "node_modules/.bin/vite";

const child = spawn(viteBin, viteArgs, {
  env: {
    ...process.env,
    VITE_ASR_CLIENT_DEBUG: debugLoopback ? "1" : "0",
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
