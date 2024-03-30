import type { Block, KnownBlock, App } from "@slack/bolt";
import { prisma } from "./index.js";
import { Cron } from "croner";

const getTheLeadersOfTheBoard = async (userId: string, month: boolean) => {
  const g = await prisma.game.findFirstOrThrow();
  const blocks: (Block | KnownBlock)[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: month
          ? `Up vs. Down Leaderboard - ${new Date().toLocaleString("en-us", {
              month: "long",
            })} ${new Date().getFullYear()}`
          : "Up vs. Down Leaderboard - All Time",
        emoji: true,
      },
    },
  ];
  if (!month)
    blocks.push(
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*UP* team wins: ${g.upTeamWins}`,
          },
          {
            type: "mrkdwn",
            text: `*DOWN* team wins: ${g.downTeamWins}`,
          },
        ],
      },
      {
        type: "divider",
      }
    );

  const users = await prisma.user.findMany({
    orderBy: month
      ? {
          countsThisMonth: "desc",
        }
      : { countsTotal: "desc" },
  });
  let pos = 0;
  let addedFetcher = false;
  for (const user of users) {
    pos++;
    if (pos > 10) break;

    let bold = false;
    if (user.id == userId) {
      bold = true;
      addedFetcher = true;
    }
    if (pos == 1) bold = true;
    const counts = month ? user.countsThisMonth : user.countsTotal;
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: bold
          ? `*${pos}. <@${user.id}> - ${counts} for team ${user.team}*`
          : `${pos}. <@${user.id}> - ${counts} for team ${user.team}`,
      },
    });
  }

  if (!addedFetcher) {
    const fetcher = users.find((user) => user.id == userId);
    if (!fetcher) return blocks;
    blocks.push({
      type: "divider",
    });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${users.indexOf(fetcher) + 1}. <@${fetcher.id}> - ${
          month ? fetcher?.countsThisMonth : fetcher?.countsTotal
        } for team ${fetcher?.team}*`,
      },
    });
  }
  return blocks;
};

export const initLeaderboardHandler = (bolt: App) => {
  bolt.command("/leaderboard-month", async ({ command, ack, respond }) => {
    await ack();
    const blocks = await getTheLeadersOfTheBoard(command.user_id, true);
    return await respond({ blocks });
  });

  bolt.command("/leaderboard", async ({ command, ack, respond }) => {
    await ack();
    const blocks = await getTheLeadersOfTheBoard(command.user_id, false);
    return await respond({ blocks });
  });

  bolt.event("app_home_opened", async ({ event, client }) => {
    const month = await getTheLeadersOfTheBoard(event.user, true);
    const total = await getTheLeadersOfTheBoard(event.user, false);
    client.views.publish({
      user_id: event.user,
      view: {
        type: "home",
        blocks: [...total, ...month],
      },
    });
  });
};

const resetLeaderboard = async () => {
  await prisma.user.updateMany({
    data: {
      countsThisMonth: 0,
    },
  });
};
Cron("0 0 1 * *", resetLeaderboard);
