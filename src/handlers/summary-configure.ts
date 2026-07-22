import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore, getSchedule, setSchedule, type NotificationSchedule } from "../store.js";

registerMainMenuItem({ label: "🌅 Summary", data: "summary:configure", order: 40 });

const SUMMARY_TIMES = [
  { label: "7:00 AM", value: "07:00" },
  { label: "8:00 AM", value: "08:00" },
  { label: "9:00 AM", value: "09:00" },
  { label: "10:00 AM", value: "10:00" },
];

const composer = new Composer<Ctx>();

composer.callbackQuery("summary:configure", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const schedule = await getSchedule(store, ctx.from!.id);
  const enabled = schedule?.summary_enabled ?? false;
  const time = schedule?.summary_time ?? "08:00";

  await ctx.reply(
    `🌅 Morning summary\n\n` +
    `Status: ${enabled ? "✅ Enabled" : "⏸ Disabled"}\n` +
    `Delivery time: ${time}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton(enabled ? "⏸ Disable summary" : "✅ Enable summary", "summary:toggle")],
        [inlineButton("⏰ Set time", "summary:time")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery("summary:toggle", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const existing = await getSchedule(store, ctx.from!.id);
  const schedule: NotificationSchedule = {
    user_id: ctx.from!.id,
    summary_enabled: !(existing?.summary_enabled ?? false),
    summary_time: existing?.summary_time ?? "08:00",
    quiet_hours_start: existing?.quiet_hours_start ?? "22:00",
    quiet_hours_end: existing?.quiet_hours_end ?? "07:00",
  };
  await setSchedule(store, schedule);

  const status = schedule.summary_enabled ? "✅ Enabled" : "⏸ Disabled";
  await ctx.editMessageText(
    `🌅 Morning summary\n\n` +
    `Status: ${status}\n` +
    `Delivery time: ${schedule.summary_time}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton(schedule.summary_enabled ? "⏸ Disable summary" : "✅ Enable summary", "summary:toggle")],
        [inlineButton("⏰ Set time", "summary:time")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery("summary:time", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "summary:set_time";
  const buttons = SUMMARY_TIMES.map((t) => [inlineButton(t.label, `summary:time:${t.value}`)]);
  buttons.push([inlineButton("⬅️ Back", "summary:configure")]);
  await ctx.editMessageText("Pick a delivery time:", {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery(/^summary:time:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const time = ctx.match![1];
  const store = getStore();
  const existing = await getSchedule(store, ctx.from!.id);
  const schedule: NotificationSchedule = {
    user_id: ctx.from!.id,
    summary_enabled: existing?.summary_enabled ?? true,
    summary_time: time,
    quiet_hours_start: existing?.quiet_hours_start ?? "22:00",
    quiet_hours_end: existing?.quiet_hours_end ?? "07:00",
  };
  await setSchedule(store, schedule);
  ctx.session.step = undefined;

  await ctx.editMessageText(
    `🌅 Morning summary\n\n` +
    `Status: ${schedule.summary_enabled ? "✅ Enabled" : "⏸ Disabled"}\n` +
    `Delivery time: ${time}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton(schedule.summary_enabled ? "⏸ Disable summary" : "✅ Enable summary", "summary:toggle")],
        [inlineButton("⏰ Set time", "summary:time")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

export default composer;
