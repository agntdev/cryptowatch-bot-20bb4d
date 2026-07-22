import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, confirmKeyboard } from "../toolkit/index.js";
import { getStore, getWatchlist, addToWatchlist, removeFromWatchlist, isInWatchlist } from "../store.js";

// Pre-seeded coins for quick add
const PRESEEDED = [
  { ticker: "BTC", display_name: "Bitcoin" },
  { ticker: "ETH", display_name: "Ethereum" },
  { ticker: "TON", display_name: "Toncoin" },
  { ticker: "SOL", display_name: "Solana" },
  { ticker: "DOGE", display_name: "Dogecoin" },
  { ticker: "XRP", display_name: "Ripple" },
  { ticker: "ADA", display_name: "Cardano" },
  { ticker: "DOT", display_name: "Polkadot" },
];

registerMainMenuItem({ label: "📋 Watchlist", data: "watchlist:manage", order: 10 });

const composer = new Composer<Ctx>();

composer.callbackQuery("watchlist:manage", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const watchlist = await getWatchlist(store, ctx.from!.id);
  const lines = watchlist.length > 0
    ? watchlist.map((w) => `• ${w.ticker} — ${w.display_name}`).join("\n")
    : "No coins yet — tap Add below to get started.";

  await ctx.reply(`📋 Your watchlist:\n\n${lines}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add coin", "watchlist:add")],
      [inlineButton("🗑 Remove coin", "watchlist:remove")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery("watchlist:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const watchlist = await getWatchlist(store, ctx.from!.id);
  const currentTickers = new Set(watchlist.map((w) => w.ticker));

  const available = PRESEEDED.filter((p) => !currentTickers.has(p.ticker));
  if (available.length === 0) {
    await ctx.editMessageText("All pre-seeded coins are already on your watchlist.\n\nType a ticker (e.g. LINK) to add a different coin.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "watchlist:manage")]]),
    });
    return;
  }

  const buttons = available.map((p) => [inlineButton(`${p.display_name} (${p.ticker})`, `watchlist:add:${p.ticker}`)]);
  buttons.push([inlineButton("⬅️ Back", "watchlist:manage")]);

  await ctx.editMessageText("Pick a coin to add:", {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery(/^watchlist:add:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match![1].toUpperCase();
  const store = getStore();
  const userId = ctx.from!.id;

  if (await isInWatchlist(store, userId, ticker)) {
    await ctx.answerCallbackQuery({ text: `${ticker} is already on your watchlist`, show_alert: true });
    return;
  }

  const preset = PRESEEDED.find((p) => p.ticker === ticker);
  await addToWatchlist(store, {
    ticker,
    display_name: preset?.display_name ?? ticker,
    user_id: userId,
  });

  await ctx.answerCallbackQuery({ text: `${ticker} added` });
  const watchlist = await getWatchlist(store, userId);
  const lines = watchlist.map((w) => `• ${w.ticker} — ${w.display_name}`).join("\n");
  await ctx.editMessageText(`✅ ${ticker} added!\n\n📋 Your watchlist:\n\n${lines}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add coin", "watchlist:add")],
      [inlineButton("🗑 Remove coin", "watchlist:remove")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery("watchlist:remove", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const watchlist = await getWatchlist(store, ctx.from!.id);

  if (watchlist.length === 0) {
    await ctx.editMessageText("Your watchlist is empty — nothing to remove.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "watchlist:manage")]]),
    });
    return;
  }

  const buttons = watchlist.map((w) => [inlineButton(`🗑 ${w.ticker}`, `watchlist:rm:${w.ticker}`)]);
  buttons.push([inlineButton("⬅️ Back", "watchlist:manage")]);

  await ctx.editMessageText("Tap a coin to remove it:", {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery(/^watchlist:rm:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match![1].toUpperCase();
  const store = getStore();
  const userId = ctx.from!.id;

  await removeFromWatchlist(store, userId, ticker);
  await ctx.answerCallbackQuery({ text: `${ticker} removed` });

  const watchlist = await getWatchlist(store, userId);
  const lines = watchlist.length > 0
    ? watchlist.map((w) => `• ${w.ticker} — ${w.display_name}`).join("\n")
    : "No coins yet — tap Add below to get started.";

  await ctx.editMessageText(`🗑 ${ticker} removed.\n\n📋 Your watchlist:\n\n${lines}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add coin", "watchlist:add")],
      [inlineButton("🗑 Remove coin", "watchlist:remove")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// Handle typed tickers when user is in add-coin mode
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "watchlist:add_ticker") return next();
  const ticker = ctx.message.text.trim().toUpperCase();
  if (!/^[A-Z]{2,10}$/.test(ticker)) {
    await ctx.reply("Enter a valid ticker (2–10 letters, e.g. LINK).");
    return;
  }
  const store = getStore();
  const userId = ctx.from!.id;
  if (await isInWatchlist(store, userId, ticker)) {
    await ctx.reply(`${ticker} is already on your watchlist.`);
    ctx.session.step = undefined;
    return;
  }
  await addToWatchlist(store, { ticker, display_name: ticker, user_id: userId });
  ctx.session.step = undefined;
  const watchlist = await getWatchlist(store, userId);
  const lines = watchlist.map((w) => `• ${w.ticker} — ${w.display_name}`).join("\n");
  await ctx.reply(`✅ ${ticker} added!\n\n📋 Your watchlist:\n\n${lines}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add coin", "watchlist:add")],
      [inlineButton("🗑 Remove coin", "watchlist:remove")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

export default composer;
