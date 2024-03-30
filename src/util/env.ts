import z from "zod";

const envSchema = z.object({
  TOKEN: z.string(),
  DATABASE_URL: z.string(),
  CHANNEL: z.string(),
});
export default envSchema.parse(process.env);
