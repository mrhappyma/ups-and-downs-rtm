import { Team } from "@prisma/client";
import { getPerson, teamAssignmentMethod } from "./index.js";
import env from "./util/env.js";
import { App } from "@slack/bolt";

export const initNewUserHandler = (bolt: App) => {
  bolt.event("member_joined_channel", async ({ event }) => {
    if (event.channel != env.CHANNEL) return;
    const user = await getPerson(event.user);
    if (!user) return;
    const g = user.t == Team.UP ? "up to 100" : "down to -100";

    let m = "none - were you here before? or are you a ghost?";
    //wacky ts
    if ("m" in user) {
      switch (user.m) {
        case teamAssignmentMethod.active:
          m = "active members";
          break;
        case teamAssignmentMethod.all:
          m = "total members";
          break;
        case teamAssignmentMethod.random:
          m = "random";
          break;
      }
    }
    await bolt.client.chat.postMessage({
      channel: env.CHANNEL,
      text: `Hey <@${event.user}>! Welcome to <#${env.CHANNEL}>!\nYou're on team *${user.t}*, which means your goal is to get the number ${g}.`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Hey <@${event.user}>! Welcome to <#${env.CHANNEL}>!\nYou're on team *${user.t}*, which means your goal is to get the number ${g}.`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `team selection method - ${m}`,
            },
          ],
        },
      ],
    });
  });
};
