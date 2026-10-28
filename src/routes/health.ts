import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async (_request, reply) => {
    return reply.status(200).send({ status: "ok" });
  });

  fastify.get("/ready", async (_request, reply) => {
    try {
      const dbCheck = fastify.prisma.$queryRaw`SELECT 1`;
      const timeout = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Database readiness check timed out"));
        }, 2000);
        timer.unref();
      });

      await Promise.race([dbCheck, timeout]);
      return reply.status(200).send({ status: "ready" });
    } catch (error) {
      fastify.log.error({ error }, "Readiness database check failed");
      return reply.status(503).send({
        status: "unavailable",
        message: "Database connection is unavailable",
      });
    }
  });
};
