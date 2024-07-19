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
    const messages = (
      await modern.conversations.history({
        latest: ts,
        channel: env.CHANNEL,
        limit: 5,
        inclusive: true,
      })
    ).messages;
    const message = messages?.find((m) => m.ts == ts);
    if (!message) {
      screwedUp(ScrewedUpReason.deleted, user, ts);
      setLatestMessage(undefined, undefined, undefined);
    } else if (message.text != text) {
      screwedUp(ScrewedUpReason.edited, user, ts);
      setLatestMessage(undefined, undefined, undefined);
    }
  }, 1500);
};
