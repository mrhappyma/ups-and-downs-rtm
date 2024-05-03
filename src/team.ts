import { App } from "@slack/bolt";
import { getPerson } from "./index.js";

export const initTeamCommandHandler = (bolt: App) => {
  bolt.command("/team", async ({ command, ack, respond }) => {
    await ack();
    const regexId = command.text.match(/<@([UW][A-Z0-9]+)\|/);
    const id = regexId ? regexId[1] : command.user_id;
    const user = await getPerson(id);
    if (!user) return;
    const t = id == command.user_id ? "You're" : `<@${id}> is`;
    await respond(`${t} on team *${user.t}*!`);
  });
};
