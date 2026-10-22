// Prisma CLI configuration. The CLI does not read .env on its own, so
// dotenv loads it here. DATABASE_URL is never committed — see .env.example.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Optional so `npm install` (which runs `prisma generate`) works before
  // .env exists. Migration commands still require DATABASE_URL.
  ...(url ? { datasource: { url } } : {}),
});
