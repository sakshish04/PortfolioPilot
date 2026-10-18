
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

const databaseUrl = new URL(connectionString);
const caPath = path.resolve(
  process.cwd(),
  "backend/certs/tidb-ca.pem"
);
const ca = fs.existsSync(caPath) ? fs.readFileSync(caPath, "utf8") : undefined;

export default defineConfig({
  schema: "./backend/drizzle/schema.ts",
  out: "./backend/drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.replace(/^\//, ""),
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
  },
});
