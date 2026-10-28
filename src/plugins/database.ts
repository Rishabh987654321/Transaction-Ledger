import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  const prisma = new PrismaClient({
    log:
      fastify.log.level === "debug"
        ? ["query", "info", "warn", "error"]
        : ["warn", "error"],
  });

  try {
    await prisma.$connect();
    fastify.log.info("Database connection established successfully");
  } catch (error) {
    fastify.log.error({ error }, "Failed to connect to the database");
    throw error;
  }

  fastify.decorate("prisma", prisma);

  fastify.addHook("onClose", async (instance) => {
    instance.log.info("Closing database connection...");
    await instance.prisma.$disconnect();
  });
};

export default fp(databasePlugin, {
  name: "database",
});
