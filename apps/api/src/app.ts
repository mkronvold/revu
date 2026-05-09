import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";

import { registerRoutes } from "./routes.js";
import { createApiStore } from "./store.js";

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  const store = createApiStore();

  app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok" as const }));
  app.register(registerRoutes, { prefix: "/api/v1", store });

  return app;
}
