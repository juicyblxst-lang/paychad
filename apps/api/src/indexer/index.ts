import { runConfiguredIndexer } from "./scanner";

const controller = new AbortController();
let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Indexer received ${signal}; stopping after the current operation`);
  controller.abort();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

runConfiguredIndexer(controller.signal)
  .then(() => console.log("PayChad indexer stopped cleanly"))
  .catch((error) => {
    console.error("PayChad indexer stopped with an error", error);
    process.exitCode = 1;
  });
