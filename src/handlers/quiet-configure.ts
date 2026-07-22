import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore, getSchedule, setSchedule, type NotificationSchedule } from "../store.js";

registerMainMenuItem({ label: "🌙 Quiet Hours", data: "quiet:configure", order: 50 });

const TIME_OPTIONS = [
  "20:00", "21:00", "22:00", "23:00", "00:00",
  "05:00", "06:00", "07:00", "08:00", "09:00",
];

const composer = new Composer<Ctx>();

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h!, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

composer.callbackQuery("quiet:configure", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const schedule = await getSchedule(store, ctx.from!.id);
  const start = schedule?.quiet_hours_start ?? "22:00";
  const end = schedule?.quiet_hours_end ?? "07:00";

  await ctx.reply(
    `🌙 Quiet hours\n\n` +
    `Alerts are suppressed during this window.\n` +
    `Current: ${formatTime(start)} → ${formatTime(end)}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⏰ Set start time", "quiet:start")],
        [inlineButton("⏰ Set end time", "quiet:end")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery("quiet:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "quiet:set_start";
  const buttons = TIME_OPTIONS.map((t) => [inlineButton(formatTime(t), `quiet:start:${t}`)]);
  buttons.push([inlineButton("⬅️ Back", "quiet:configure")]);
  await ctx.editMessageText("When should quiet hours start?", {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery(/^quiet:start:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const time = ctx.match![1];
  const store = getStore();
  const existing = await getSchedule(store, ctx.from!.id);
  const schedule: NotificationSchedule = {
    user_id: ctx.from!.id,
    summary_enabled: existing?.summary_enabled ?? false,
    summary_time: existing?.summary_time ?? "08:00",
    quiet_hours_start: time,
    quiet_hours_end: existing?.quiet_hours_end ?? "07:00",
  };
  await setSchedule(store, schedule);
  ctx.session.step = undefined;

  await ctx.editMessageText(
    `🌙 Quiet hours\n\n` +
    `Alerts are suppressed during this window.\n` +
    `Current: ${formatTime(schedule.quiet_hours_start)} → ${formatTime(schedule.quiet_hours_end)}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⏰ Set start time", "quiet:start")],
        [inlineButton("⏰ Set end time", "quiet:end")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery("quiet:end", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "quiet:set_end";
  const buttons = TIME_OPTIONS.map((t) => [inlineButton(formatTime(t), `quiet:end:${t}`)]);
  buttons.push([inlineButton("⬅️ Back", "quiet:configure")]);
  await ctx.editMessageText("When should quiet hours end?", {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery(/^quiet:end:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const time = ctx.match![1];
  const store = getStore();
  const existing = await getSchedule(store, ctx.from!.id);
  const schedule: NotificationSchedule = {
    user_id: ctx.from!.id,
    summary_enabled: existing?.summary_enabled ?? false,
    summary_time: existing?.summary_time ?? "08:00",
    quiet_hours_start: existing?.quiet_hours_start ?? "22:00",
    quiet_hours_end: time,
  };
  await setSchedule(store, schedule);
  ctx.session.step = undefined;

  await ctx.editMessageText(
    `🌙 Quiet hours\n\n` +
    `Alerts are suppressed during this window.\n` +
    `Current: ${formatTime(schedule.quiet_hours_start)} → ${formatTime(schedule.quiet_hours_end)}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⏰ Set start time", "quiet:start")],
        [inlineButton("⏰ Set end time", "quiet:end")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

export default composer;
