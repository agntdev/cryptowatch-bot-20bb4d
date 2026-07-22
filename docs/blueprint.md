# Crypto Tracker Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A personalized Telegram bot for tracking cryptocurrency prices with customizable alerts, on-demand price checks, and optional morning summaries. Users can manage watchlists, set threshold/percentage alerts with cooldowns, and configure quiet hours. The owner receives aggregate analytics about user activity and top-fired alerts.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual crypto investors
- hobbyist traders
- price watchers

## Success criteria

- users can add/remove coins to watchlists
- alerts trigger accurately with cooldown enforcement
- morning summaries deliver at configured times
- owner dashboard shows active user metrics and alert rankings

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Begin onboarding and set timezone
- **Manage Watchlist** (button, actor: user, callback: watchlist:manage) — Add/remove/list coins with pre-seeded BTC/ETH/TON options
- **Set Alert** (button, actor: user, callback: alert:create) — Start guided alert configuration process
- **View Alerts** (button, actor: user, callback: alert:list) — Display active alert rules with edit/remove options
- **Configure Summary** (button, actor: user, callback: summary:configure) — Toggle morning summary and set delivery time
- **Set Quiet Hours** (button, actor: user, callback: quiet:configure) — Define time window for alert suppression
- **/price** (command, actor: user, command: /price) — Request current price of specified coin or entire watchlist

## Flows

### onboarding
_Trigger:_ /start

1. Welcome message
2. Timezone selection

_Data touched:_ user_profile

### watchlist_management
_Trigger:_ watchlist:manage

1. Display current watchlist
2. Add coin (button/typed ticker)
3. Remove coin confirmation

_Data touched:_ watchlist_item

### alert_configuration
_Trigger:_ alert:create

1. Coin selection
2. Alert type (threshold/percentage)
3. Direction selection
4. Value input
5. Cooldown selection
6. Rule confirmation

_Data touched:_ alert_rule

### price_check
_Trigger:_ /price

1. Parse ticker parameter
2. Fetch current price data
3. Format price response with 24h change

_Data touched:_ alert_event

### morning_summary
_Trigger:_ scheduled:summary

1. Check user's quiet hours status
2. Compile watchlist price changes
3. Send formatted summary

_Data touched:_ notification_schedule, alert_event

### alert_cooldown
_Trigger:_ alert:triggered

1. Check cooldown status
2. Send initial alert if applicable
3. Schedule follow-up check at cooldown expiration

_Data touched:_ alert_rule, alert_event

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **user_profile** _(retention: persistent)_ — User preferences and metadata
  - fields: telegram_id, timezone, last_active
- **watchlist_item** _(retention: persistent)_ — Coins being tracked by user
  - fields: ticker, display_name, user_id
- **alert_rule** _(retention: persistent)_ — Price alert conditions
  - fields: type, direction, value, cooldown_hours, user_id, coin_ticker
- **notification_schedule** _(retention: persistent)_ — User notification preferences
  - fields: summary_time, quiet_hours_start, quiet_hours_end, user_id
- **alert_event** _(retention: persistent)_ — Record of triggered alerts
  - fields: coin, old_price, new_price, percent_change, timestamp, rule_id

## Integrations

- **Telegram** (required) — Bot API messaging and inline buttons
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View total users and 30-day active users
- Access top 10 most-fired alerts ranking
- See aggregate alert statistics

## Notifications

- Price alert notifications with change metrics
- Morning summary digest
- Quiet hours alert suppression with post-quiet summary

## Permissions & privacy

- Store only necessary user data (ID, timezone, preferences)
- No sharing of user watchlists or alert history
- Error responses avoid exposing system details

## Edge cases

- Overlapping alert cooldown periods
- Price feed API outages during quiet hours
- Timezone changes after alert creation
- Multiple alert rules triggering simultaneously for same coin

## Required tests

- End-to-end alert creation and suppression flow
- Morning summary delivery during active hours
- Watchlist price check with 24h change display
- Quiet hours boundary behavior testing

## Assumptions

- Using CoinGecko or similar API for price data
- Cooldown periods apply per user+coin+rule combination
- Morning summary only includes coins with >5% 24h change
