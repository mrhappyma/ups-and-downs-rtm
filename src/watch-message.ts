import { App } from "@slack/bolt";
import env from "./util/env.js";
import { WebClient } from "@slack/web-api";
import { ScrewedUpReason, screwedUp } from "./index.js";

let ts: string | undefined;
let text: string | undefined;
let user: string | undefined;

export const setLatestMessage = (
  mts: string | undefined,
  mtext: string | undefined,
  muser: string | undefined
) => {
  ts = mts;
  text = mtext;
  user = muser;
};

export const initWatchLatestMessage = (bolt: App, modern: WebClient) => {
  setInterval(async () => {
    if (!ts || !text || !user) return;
    const message = await modern.conversations.history({
      channel: env.CHANNEL,
      latest: ts,
      limit: 1,
      inclusive: true,
    });
    if (!message.ok) return;
    if (!message.messages || message.messages.length === 0) return;
    const m = message.messages[0];
    if (m.ts != ts) {
      screwedUp(ScrewedUpReason.deleted, user, ts);
      setLatestMessage(undefined, undefined, undefined);
    } else if (m.text != text) {
      screwedUp(ScrewedUpReason.edited, user, ts);
      setLatestMessage(undefined, undefined, undefined);
    }
  }, 1500);
};
