import { z } from "zod";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  TWITCH_CLIENT_ID: z.string().min(1),
  TWITCH_CLIENT_SECRET: z.string().min(1),
  TWITCH_REDIRECT_URI: z.string().url(),
  TWITCH_BOT_USERNAME: z.string().default(""),
  TWITCH_CHANNEL: z.string().default(""),
  STREAMER_TWITCH_ID: z.string().default(""),
  JWT_SECRET: z.string().min(8),
  ADMIN_API_KEY: z.string().min(8),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:");
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
