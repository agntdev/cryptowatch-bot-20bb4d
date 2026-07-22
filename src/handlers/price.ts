import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore, getWatchlist, getUserProfile } from "../store.js";

// Ticker → CoinGecko ID mapping
const COIN_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  TON: "the-open-network",
  SOL: "solana",
  DOGE: "dogecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOT: "polkadot",
  LINK: "chainlink",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  SHIB: "shiba-inu",
  LTC: "litecoin",
  UNI: "uniswap",
  AAVE: "aave",
};

function tickerToId(ticker: string): string | null {
  return COIN_IDS[ticker.toUpperCase()] ?? null;
}

async function fetchPrices(ids: string[]): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Price API error: ${res.status}`);
  return res.json() as Promise<Record<string, { usd: number; usd_24h_change: number }>>;
}

function formatPrice(price: number): string {
  if (price >= 1) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toFixed(6)}`;
}

function formatChange(change: number | undefined): string {
  if (change == null || isNaN(change)) return "";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

const composer = new Composer<Ctx>();

composer.command("price", async (ctx) => {
  const store = getStore();
  const args = (ctx.message?.text ?? "").replace("/price", "").trim().toUpperCase();
  const userId = ctx.from!.id;

  if (args) {
    // Single coin price check
    const coinId = tickerToId(args);
    if (!coinId) {
      await ctx.reply(`Couldn't find a coin with ticker "${args}". Check the spelling and try again.`);
      return;
    }
    try {
      const prices = await fetchPrices([coinId]);
      const data = prices[coinId];
      if (!data) {
        await ctx.reply(`Price data for ${args} is temporarily unavailable. Try again in a moment.`);
        return;
      }
      const changeStr = formatChange(data.usd_24h_change);
      await ctx.reply(`📊 ${args}: ${formatPrice(data.usd)}` + (changeStr ? ` (${changeStr} 24h)` : ""), {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      });
    } catch {
      await ctx.reply("Couldn't reach the price service. Try again in a moment.", {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      });
    }
  } else {
    // Full watchlist price check
    const watchlist = await getWatchlist(store, userId);
    if (watchlist.length === 0) {
      await ctx.reply("Your watchlist is empty — tap Manage Watchlist to add some coins.", {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      });
      return;
    }
    const coinIds = watchlist.map((w) => tickerToId(w.ticker)).filter(Boolean) as string[];
    if (coinIds.length === 0) {
      await ctx.reply("No recognized coins in your watchlist.", {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      });
      return;
    }
    try {
      const prices = await fetchPrices(coinIds);
      const lines = watchlist.map((w) => {
        const coinId = tickerToId(w.ticker);
        const data = coinId ? prices[coinId] : null;
        if (!data) return `${w.ticker}: unavailable`;
        const changeStr = formatChange(data.usd_24h_change);
        return `${w.ticker}: ${formatPrice(data.usd)}` + (changeStr ? ` (${changeStr})` : "");
      });
      await ctx.reply("📊 Watchlist prices:\n\n" + lines.join("\n"), {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      });
    } catch {
      await ctx.reply("Couldn't reach the price service. Try again in a moment.", {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      });
    }
  }
});

export default composer;
