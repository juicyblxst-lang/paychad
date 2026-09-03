import { spawn } from "node:child_process";

const api = spawn(process.execPath, ["dist/index.js"], { stdio: "inherit", env: process.env });
const indexer = spawn(process.execPath, ["dist/indexer/index.js"], { stdio: "inherit", env: process.env });
let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  api.kill(signal);
  indexer.kill(signal);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

api.once("exit", (code) => {
  if (!shuttingDown) {
    console.error(`API process exited with code ${code ?? "unknown"}; stopping indexer`);
    indexer.kill("SIGTERM");
    process.exitCode = code ?? 1;
  }
});

indexer.once("exit", (code) => {
  if (!shuttingDown) {
    console.error(`Indexer process exited with code ${code ?? "unknown"}; stopping API`);
    api.kill("SIGTERM");
    process.exitCode = code ?? 1;
  }
});
