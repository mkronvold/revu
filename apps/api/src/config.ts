export const config = {
  host: "0.0.0.0",
  port: Number(process.env.PORT ?? "4000"),
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://revu:revu@localhost:5432/revu",
};
