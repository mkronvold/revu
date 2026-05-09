import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = buildApp({
  logger: process.env.NODE_ENV !== "test",
});

const start = async () => {
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

await start();
