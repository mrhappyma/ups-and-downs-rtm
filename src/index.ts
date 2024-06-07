import { RTMClient } from "@slack/rtm-api";
import env from "./util/env.js";
import { PrismaClient, Team } from "@prisma/client";
import type { GenericMessageEvent, MessageEvent } from "@slack/bolt";
import Bolt from "@slack/bolt";
const { App } = Bolt;
import { initLeaderboardHandler } from "./leaderboard.js";
import { initNewUserHandler } from "./new-user.js";
import { initTeamCommandHandler } from "./team.js";
import { WebClient } from "@slack/web-api";
import { initWatchLatestMessage, setLatestMessage } from "./watch-message.js";

const rtm = new RTMClient(env.TOKEN);
const modern = new WebClient(env.MODERN_TOKEN);
export const bolt = new App({
  token: env.TOKEN,
  signingSecret: env.SIGNING_SECRET,
  customRoutes: [
    {
      path: "/",
      method: ["GET"],
      handler: (req, res) => {
        res.writeHead(200);
        res.end(`Things are going just fine at ${req.headers.host}!`);
      },
    },
    {
      path: "/api/games",
      method: ["GET"],
      handler: async (req, res) => {
        const games = await prisma.game.findMany();
        res.writeHead(200);
        res.end(JSON.stringify(games));
      },
    },
  ],
});
export const prisma = new PrismaClient();

initNewUserHandler(bolt);
initLeaderboardHandler(bolt);
initTeamCommandHandler(bolt);
initWatchLatestMessage(bolt, modern);

const game = await prisma.game.findFirstOrThrow();
const id = game.id;
export let count = game.number;
export let lastCounter = game.lastCounter;

rtm.on("message", async (event) => {
  const e = event as MessageEvent;
  if (e.channel != env.CHANNEL) return;
  if (e.subtype) return;

  const n = parseInt(e.text ?? "");
  if (Number.isNaN(n)) return;

  if (e.user == lastCounter)
    return screwedUp(ScrewedUpReason.doubleCount, e.user, e.ts);

  const p = await getPerson(e.user);
  if (!p) return;
  const next = p.t == Team.UP ? count + 1 : count - 1;
  if (next != n) return screwedUp(ScrewedUpReason.wrongCount, e.user, e.ts);

  count = n;
  lastCounter = e.user;
  await Promise.all([
    prisma.game.update({
      where: {
        id,
      },
      data: {
        number: n,
        lastCounter: e.user,
      },
    }),
    prisma.user.update({
      where: {
        id: e.user,
      },
      data: {
        countsThisMonth: {
          increment: 1,
        },
        countsTotal: {
          increment: 1,
        },
        lastCount: new Date(),
      },
    }),
    bolt.client.reactions.add({
      channel: e.channel,
      timestamp: e.ts,
      name: "white_check_mark",
    }),
    setLatestMessage(e.ts, e.text!, e.user),
  ]);

  const w = n >= 100 || n <= -100;
  if (w) {
    count = 0;
    lastCounter = null;
    await bolt.client.reactions.add({
      channel: e.channel,
      timestamp: e.ts,
      name: "tada",
    });
    const wt = n >= 100 ? Team.UP : Team.DOWN;
    const g = prisma.game.update({
      where: {
        id,
      },
      data: {
        number: 0,
        lastCounter: null,
        upTeamWins: {
          increment: wt == Team.UP ? 1 : 0,
        },
        downTeamWins: {
          increment: wt == Team.DOWN ? 1 : 0,
        },
      },
    });
    rtm.sendMessage(
      `And that's a win for Team ${wt}! Great job, everyone!\nThe game has been reset. The next number is 1 or -1, depending on your team.\n\nTeam Up wins: ${
        (await g).upTeamWins
      }\nTeam Down wins: ${(await g).downTeamWins}`,
      e.channel
    );
  }
});

const people: Map<string, { t: Team; g: boolean } | null> = new Map();
export const getPerson = async (u: string) => {
  const m = people.get(u);
  if (m) return m;

  const db = await prisma.user.findUnique({
    where: {
      id: u,
    },
  });
  if (!db) {
    const user = await bolt.client.users.info({
      user: u,
    });
    if (user.user?.is_bot) return null;
    const n = await generateNewUserTeam();
    await prisma.user.create({
      data: {
        id: u,
        team: n.t,
      },
    });
    try {
      const groupid = n.t == Team.UP ? env.UP_GROUP_ID : env.DOWN_GROUP_ID;
      const group = await modern.usergroups.users.list({
        usergroup: groupid,
      });
      await modern.usergroups.users.update({
        usergroup: groupid,
        users: `${group.users?.join(",")},${u}`,
      });
    } catch (e) {
      console.log(e);
    }
    people.set(u, { t: n.t, g: false });
    return { t: n.t, g: false, m: n.method };
  }
  const b = { t: db.team, g: db.usedGrace };
  people.set(u, b);
  return b;
};

export enum teamAssignmentMethod {
  active,
  all,
  random,
}
const generateNewUserTeam = async () => {
  const everyone = await prisma.user.findMany();
  const ago = new Date();
  ago.setDate(ago.getDate() - 14);
  const activeTeamUp = everyone.filter(
    (u) => u.team == Team.UP && (u.lastCount ?? 0) > ago
  ).length;
  const activeTeamDown = everyone.filter(
    (u) => u.team == Team.DOWN && (u.lastCount ?? 0) > ago
  ).length;
  if (activeTeamDown > activeTeamUp)
    return { t: Team.UP, method: teamAssignmentMethod.active };
  if (activeTeamUp > activeTeamDown)
    return { t: Team.DOWN, method: teamAssignmentMethod.active };
  const allTeamUp = everyone.filter((u) => u.team == Team.UP).length;
  const allTeamDown = everyone.filter((u) => u.team == Team.DOWN).length;
  if (allTeamDown > allTeamUp)
    return { t: Team.UP, method: teamAssignmentMethod.all };
  if (allTeamUp > allTeamDown)
    return { t: Team.DOWN, method: teamAssignmentMethod.all };
  return {
    t: Math.random() > 0.5 ? Team.UP : Team.DOWN,
    method: teamAssignmentMethod.random,
  };
};

export enum ScrewedUpReason {
  doubleCount,
  wrongCount,
  edited,
  deleted,
}
export const screwedUp = async (
  r: ScrewedUpReason,
  user: string,
  ts: string
) => {
  let a = 5;
  if (r == ScrewedUpReason.deleted) a = 7;
  const p = (await getPerson(user)) as { t: Team; g: boolean };
  const n = p.t == Team.UP ? count + 1 : count - 1;
  const w = p.t == Team.UP ? count - a : count + a;
  let m1;
  let m2;
  switch (r) {
    case ScrewedUpReason.doubleCount:
      m1 = `You can't count twice in a row, <@${user}>!`;
      break;
    case ScrewedUpReason.wrongCount:
      m1 = `That's not the right number, <@${user}>! You're on team ${p.t}, so the next number should have been ${n}`;
      break;
    case ScrewedUpReason.edited:
      m1 = `You can't edit your counting messages, <@${user}>!`;
      break;
    case ScrewedUpReason.deleted:
      m1 = `Got'em! <@${user}> deleted one of their counts!`;
      break;
  }
  // true if they've already used it
  switch (p.g) {
    case false:
      people.set(user, { t: p.t, g: true });
      m2 =
        "Since this is your first time screwing up, I'll let you off with a warning. Don't let it happen again!";
      break;
    case true:
      count = w;
      m2 = `As punishment for your wrongdoing I'm moving the game ${a} points in the other direction. Counting resumes from ${w}, meaning the next number is ${
        w - 1
      } or ${w + 1} depending on your team.`;
  }

  await Promise.all([
    rtm.sendMessage(`${m1}\n${m2}`, env.CHANNEL),
    r != ScrewedUpReason.deleted
      ? bolt.client.reactions.add({
          channel: env.CHANNEL,
          timestamp: ts,
          name: "bangbang",
        })
      : null,
    prisma.game.update({
      where: {
        id,
      },
      data: {
        number: count,
      },
    }),
  ]);
  if (!p.g)
    await prisma.user.update({
      where: {
        id: user,
      },
      data: {
        usedGrace: true,
      },
    });
};

await rtm.start();
await bolt.start(env.PORT);
console.log("yippee");

if (env.STATUS_PUSH_URL) {
  const updateStatus = async () => {
    await fetch(env.STATUS_PUSH_URL!);
  };
  updateStatus();
  setInterval(updateStatus, 30000);
}
