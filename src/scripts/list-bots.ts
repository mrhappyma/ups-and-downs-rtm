import { PrismaClient } from "@prisma/client";
import { WebClient } from "@slack/web-api";
import env from "../util/env.js";

const prisma = new PrismaClient();
const web = new WebClient(env.TOKEN);

const users = await prisma.user.findMany();
for (const user of users) {
  try {
    const data = await web.users.info({
      user: user.id,
    });
    if (!data.user) {
      console.error(`Couldn't find ${user.id}`);
      continue;
    }
    if (data.user.is_bot) {
      console.log(`${user.id} - ${data.user.name} - ${data.user.real_name}`);
      continue;
    }
  } catch (e) {
    console.log(`error fetching ${user.id}`);
  }
}
