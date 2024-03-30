import z from "zod";

const envSchema = z.object({
  TOKEN: z.string(),
  DATABASE_URL: z.string(),
  CHANNEL: z.string(),
  SIGNING_SECRET: z.string(),
  STATUS_PUSH_URL: z.string().optional(),
  PORT: z.string().default("3000"),
});
export default envSchema.parse(process.env);
