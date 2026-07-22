import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore, getUserProfile, setUserProfile, addToWatchlist } from "../store.js";

const WELCOME = "👋 Welcome! Tap a button below to get started.";

const TIMEZONES = [
  { label: "🇺🇸 New York (UTC-5)", value: "America/New_York" },
  { label: "🇺🇸 Los Angeles (UTC-8)", value: "America/Los_Angeles" },
  { label: "🇬🇧 London (UTC+0)", value: "Europe/London" },
  { label: "🇩🇪 Berlin (UTC+1)", value: "Europe/Berlin" },
  { label: "🇯🇵 Tokyo (UTC+9)", value: "Asia/Tokyo" },
  { label: "🇦🇺 Sydney (UTC+11)", value: "Australia/Sydney" },
  { label: "🇮🇳 Mumbai (UTC+5:30)", value: "Asia/Kolkata" },
  { label: "🇸🇬 Singapore (UTC+8)", value: "Asia/Singapore" },
];

function timezoneKeyboard() {
  return inlineKeyboard(
    TIMEZONES.map((tz) => [inlineButton(tz.label, `tz:${tz.value}`)]),
  );
}

const composer = new Composer<Ctx>();

composer.command("start", async (ctx) => {
  const store = getStore();
  const profile = await getUserProfile(store, ctx.from!.id);
  if (profile) {
    await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
  } else {
    ctx.session.step = "awaiting_timezone";
    await ctx.reply(WELCOME, { reply_markup: timezoneKeyboard() });
  }
});

composer.callbackQuery(/^tz:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const tz = ctx.match![1];
  const store = getStore();
  const now = Date.now();
  await setUserProfile(store, {
    telegram_id: ctx.from!.id,
    timezone: tz,
    last_active: now,
  });
  await addToWatchlist(store, { ticker: "BTC", display_name: "Bitcoin", user_id: ctx.from!.id });
  await addToWatchlist(store, { ticker: "ETH", display_name: "Ethereum", user_id: ctx.from!.id });
  await addToWatchlist(store, { ticker: "TON", display_name: "Toncoin", user_id: ctx.from!.id });
  ctx.session.step = undefined;
  await ctx.editMessageText("✅ Timezone set! Tap a button below to get started.", {
    reply_markup: mainMenuKeyboard(),
  });
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
