import z from "zod";

const envSchema = z.object({
  TOKEN: z.string(),
  DATABASE_URL: z.string(),
  CHANNEL: z.string(),
  STATUS_PUSH_URL: z.string().optional()
});
export default envSchema.parse(process.env);
