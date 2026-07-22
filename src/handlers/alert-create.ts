import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, confirmKeyboard } from "../toolkit/index.js";
import { getStore, getWatchlist, createAlertRule, type AlertRule } from "../store.js";

registerMainMenuItem({ label: "🔔 Set Alert", data: "alert:create", order: 20 });

let alertIdCounter = Date.now();
function nextAlertId(): string {
  return `alert_${++alertIdCounter}`;
}

const COIN_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", TON: "the-open-network",
  SOL: "solana", DOGE: "dogecoin", XRP: "ripple", ADA: "cardano",
  DOT: "polkadot", LINK: "chainlink", AVAX: "avalanche-2",
};

const COOLDOWNS = [
  { label: "1 hour", value: 1 },
  { label: "4 hours", value: 4 },
  { label: "12 hours", value: 12 },
  { label: "24 hours", value: 24 },
];

const composer = new Composer<Ctx>();

composer.callbackQuery("alert:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const watchlist = await getWatchlist(store, ctx.from!.id);
  if (watchlist.length === 0) {
    await ctx.reply("Add coins to your watchlist first, then set alerts.", {
      reply_markup: inlineKeyboard([[inlineButton("📋 Manage Watchlist", "watchlist:manage")], [inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }
  ctx.session.step = "alert:coin";
  const buttons = watchlist.map((w) => [inlineButton(`${w.ticker} — ${w.display_name}`, `alert:coin:${w.ticker}`)]);
  buttons.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  await ctx.reply("Which coin do you want to set an alert for?", {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery(/^alert:coin:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match![1].toUpperCase();
  ctx.session.alertCoin = ticker;
  ctx.session.step = "alert:type";
  await ctx.editMessageText(`Alert for ${ticker}.\n\nWhat kind of alert?`, {
    reply_markup: inlineKeyboard([
      [inlineButton("📊 Price threshold", "alert:type:threshold")],
      [inlineButton("📈 % change", "alert:type:percentage")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery(/^alert:type:(threshold|percentage)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const type = ctx.match![1] as "threshold" | "percentage";
  ctx.session.alertType = type;
  ctx.session.step = "alert:direction";
  const label = type === "threshold" ? "price threshold" : "percentage change";
  await ctx.editMessageText(`${ctx.session.alertCoin} — ${label}.\n\nTrigger when the price goes…`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⬆️ Above", "alert:dir:above")],
      [inlineButton("⬇️ Below", "alert:dir:below")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery(/^alert:dir:(above|below)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const dir = ctx.match![1] as "above" | "below";
  ctx.session.alertDirection = dir;
  ctx.session.step = "alert:value";
  const placeholder = ctx.session.alertType === "threshold"
    ? "e.g. 70000 for $70,000"
    : "e.g. 5 for 5%";
  await ctx.editMessageText(`Got it — ${dir} your target.\n\nType the ${ctx.session.alertType === "threshold" ? "price" : "percentage"} value (${placeholder}):`, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "alert:value") return next();
  const text = ctx.message.text.trim();
  const num = parseFloat(text);
  if (isNaN(num) || num <= 0) {
    await ctx.reply("Enter a valid positive number. Try again.");
    return;
  }
  ctx.session.alertValue = num;
  ctx.session.step = "alert:cooldown";
  const buttons = COOLDOWNS.map((c) => [inlineButton(c.label, `alert:cd:${c.value}`)]);
  buttons.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  await ctx.reply(`Target: ${ctx.session.alertDirection} ${ctx.session.alertType === "threshold" ? `$${num.toLocaleString()}` : `${num}%`}.\n\nHow often can this alert fire?`, {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery(/^alert:cd:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const cooldown = parseInt(ctx.match![1], 10);
  ctx.session.alertCooldown = cooldown;
  ctx.session.step = "alert:confirm";

  const dir = ctx.session.alertDirection!;
  const type = ctx.session.alertType!;
  const value = ctx.session.alertValue!;
  const coin = ctx.session.alertCoin!;
  const valueStr = type === "threshold" ? `$${value.toLocaleString()}` : `${value}%`;

  await ctx.editMessageText(
    `Confirm your alert:\n\n` +
    `Coin: ${coin}\n` +
    `Type: ${type === "threshold" ? "Price threshold" : "% change"}\n` +
    `Direction: ${dir === "above" ? "⬆️ Above" : "⬇️ Below"} ${valueStr}\n` +
    `Cooldown: Every ${cooldown}h`,
    {
      reply_markup: confirmKeyboard("alert:confirm", { yes: "✅ Create alert", no: "❌ Cancel" }),
    },
  );
});

composer.callbackQuery("alert:confirm:yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const rule: AlertRule = {
    id: nextAlertId(),
    type: ctx.session.alertType!,
    direction: ctx.session.alertDirection!,
    value: ctx.session.alertValue!,
    cooldown_hours: ctx.session.alertCooldown!,
    user_id: ctx.from!.id,
    coin_ticker: ctx.session.alertCoin!,
    created_at: Date.now(),
  };
  await createAlertRule(store, rule);
  // Clear flow state
  ctx.session.step = undefined;
  ctx.session.alertCoin = undefined;
  ctx.session.alertType = undefined;
  ctx.session.alertDirection = undefined;
  ctx.session.alertValue = undefined;
  ctx.session.alertCooldown = undefined;

  await ctx.editMessageText("✅ Alert created! You'll be notified when conditions are met.", {
    reply_markup: inlineKeyboard([
      [inlineButton("🔔 Set another", "alert:create")],
      [inlineButton("📋 View alerts", "alert:list")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery("alert:confirm:no", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = undefined;
  ctx.session.alertCoin = undefined;
  ctx.session.alertType = undefined;
  ctx.session.alertDirection = undefined;
  ctx.session.alertValue = undefined;
  ctx.session.alertCooldown = undefined;
  await ctx.editMessageText("Alert cancelled.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

export default composer;
