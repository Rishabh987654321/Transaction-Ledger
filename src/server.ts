import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = buildApp();

async function start() {
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`Server listening on http://localhost:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, initiating graceful shutdown...`);
    try {
      await app.close();
      app.log.info("Server and resources closed successfully.");
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "Error during graceful shutdown");
      process.exit(1);
    }
  });
}

start();
