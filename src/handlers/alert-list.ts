import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore, getUserAlerts, deleteAlertRule, getAlertRule } from "../store.js";

registerMainMenuItem({ label: "📋 View Alerts", data: "alert:list", order: 30 });

const composer = new Composer<Ctx>();

composer.callbackQuery("alert:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const alerts = await getUserAlerts(store, ctx.from!.id);

  if (alerts.length === 0) {
    await ctx.reply("No alerts set yet — tap Set Alert to create one.", {
      reply_markup: inlineKeyboard([
        [inlineButton("🔔 Set Alert", "alert:create")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const lines = alerts.map((a) => {
    const valueStr = a.type === "threshold" ? `$${a.value.toLocaleString()}` : `${a.value}%`;
    return `• ${a.coin_ticker}: ${a.direction === "above" ? "⬆️" : "⬇️"} ${valueStr} (every ${a.cooldown_hours}h)`;
  });

  const buttons = alerts.map((a) => [
    inlineButton(`🗑 ${a.coin_ticker}`, `alert:rm:${a.id}`),
  ]);
  buttons.push([inlineButton("🔔 Set Alert", "alert:create")]);
  buttons.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  await ctx.reply(`📋 Your alerts:\n\n${lines.join("\n")}`, {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery(/^alert:rm:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ruleId = ctx.match![1];
  const store = getStore();
  const rule = await getAlertRule(store, ruleId);
  if (!rule || rule.user_id !== ctx.from!.id) {
    await ctx.answerCallbackQuery({ text: "Alert not found", show_alert: true });
    return;
  }
  await deleteAlertRule(store, rule);
  await ctx.answerCallbackQuery({ text: "Alert removed" });

  // Refresh the list
  const alerts = await getUserAlerts(store, ctx.from!.id);
  if (alerts.length === 0) {
    await ctx.editMessageText("All alerts removed. Tap Set Alert to create a new one.", {
      reply_markup: inlineKeyboard([
        [inlineButton("🔔 Set Alert", "alert:create")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const lines = alerts.map((a) => {
    const valueStr = a.type === "threshold" ? `$${a.value.toLocaleString()}` : `${a.value}%`;
    return `• ${a.coin_ticker}: ${a.direction === "above" ? "⬆️" : "⬇️"} ${valueStr} (every ${a.cooldown_hours}h)`;
  });
  const buttons = alerts.map((a) => [
    inlineButton(`🗑 ${a.coin_ticker}`, `alert:rm:${a.id}`),
  ]);
  buttons.push([inlineButton("🔔 Set Alert", "alert:create")]);
  buttons.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  await ctx.editMessageText(`📋 Your alerts:\n\n${lines.join("\n")}`, {
    reply_markup: inlineKeyboard(buttons),
  });
});

export default composer;
