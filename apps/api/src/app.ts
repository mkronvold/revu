import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";

import { closePool } from "./db.js";
import { registerRoutes } from "./routes.js";
import { resetDemoData } from "./test-reset.js";
import { createApiStore } from "./store.js";

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  const store = createApiStore();

  app.register(cors, { origin: true });
  app.addHook("onReady", async () => {
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      await resetDemoData();
    }
  });
  app.addHook("onClose", async () => {
    await closePool();
  });

  app.get("/health", async () => ({ status: "ok" as const }));
  app.register(registerRoutes, { prefix: "/api/v1", store });

  return app;
}
