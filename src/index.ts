import { RTMClient } from "@slack/rtm-api";
import env from "./util/env.js";
import { PrismaClient, Team } from "@prisma/client";
import { WebClient } from "@slack/web-api";
import type { GenericMessageEvent, MessageEvent } from "@slack/bolt";
import Cron from "croner";

const rtm = new RTMClient(env.TOKEN);
const web = new WebClient(env.TOKEN);
const prisma = new PrismaClient();

const game = await prisma.game.findFirst();
if (!game) throw new Error("database isn't set up, mate");
const id = game.id;
let count = game.number;
let lastCounter = game.lastCounter;

rtm.on("message", async (event) => {
  const e = event as MessageEvent;
  if (e.channel != env.CHANNEL) return;
  if (e.subtype) return;

  const n = parseInt(e.text ?? "");
  if (Number.isNaN(n)) return;

  if (e.user == lastCounter)
    return screwedUp(e, ScrewedUpReason.doubleCount, count);

  const p = await getPerson(event.user);
  if (!p) return noTeam(e);

  const next = p.t == Team.UP ? count + 1 : count - 1;
  if (next != n) return screwedUp(e, ScrewedUpReason.wrongCount, count);

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
      },
    }),
    web.reactions.add({
      channel: e.channel,
      timestamp: e.ts,
      name: "tw_white_check_mark",
    }),
  ]);

  const w = n >= 100 || n <= -100;
  if (w) {
    count = 0;
    lastCounter = null;
    await web.reactions.add({
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
const getPerson = async (u: string) => {
  const m = people.get(u);
  if (m) return m;

  const db = await prisma.user.findUnique({
    where: {
      id: u,
    },
  });
  const b = db ? { t: db.team, g: db.usedGrace } : null;
  people.set(u, b);
  return b;
};

const noTeam = async (e: GenericMessageEvent) => {
  await Promise.all([
    rtm.sendMessage(
      `I couldn't find what team you're on, <@${e.user}>. Run \`/team\` and try again?`,
      e.channel
    ),
    web.reactions.add({
      channel: e.channel,
      timestamp: e.ts,
      name: "whoathere",
    }),
  ]);
};

enum ScrewedUpReason {
  doubleCount,
  wrongCount,
}
const screwedUp = async (
  e: GenericMessageEvent,
  r: ScrewedUpReason,
  c: number
) => {
  const p = (await getPerson(e.user)) as { t: Team; g: boolean };
  const n = p.t == Team.UP ? c + 1 : c - 1;
  const w = p.t == Team.UP ? c - 5 : c + 5;
  let m1;
  let m2;
  switch (r) {
    case ScrewedUpReason.doubleCount:
      m1 = `You can't count twice in a row, <@${e.user}>!`;
      break;
    case ScrewedUpReason.wrongCount:
      m1 = `That's not the right number, <@${e.user}>! You're on team ${p.t}, so the next number should have been ${n}`;
      break;
  }
  // true if they've already used it
  switch (p.g) {
    case false:
      people.set(e.user, { t: p.t, g: true });
      m2 =
        "Since this is your first time screwing up, I'll let you off with a warning. Don't let it happen again!";
      break;
    case true:
      count = w;
      m2 = `As punishment for your wrongdoing I'm moving the game 5 points in the other direction. Counting resumes from ${w}, meaning the next number is ${
        w - 1
      } or ${w + 1} depending on your team.`;
  }

  await Promise.all([
    rtm.sendMessage(`${m1}\n${m2}`, e.channel),
    web.reactions.add({
      channel: e.channel,
      timestamp: e.ts,
      name: "bangbang",
    }),
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
        id: e.user,
      },
      data: {
        usedGrace: true,
      },
    });
};

await rtm.start();
console.log("yippee");

if (env.STATUS_PUSH_URL) {
  const updateStatus = async () => {
    await fetch(env.STATUS_PUSH_URL!);
  };
  updateStatus();
  new Cron("* * * * *", updateStatus);
}
