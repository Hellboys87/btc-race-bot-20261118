# btc-race-bot-20261118

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Hellboys87/btc-race-bot-20261118/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Hellboys87/btc-race-bot-20261118/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Anchorhold — a cbBTC trading bot for make.fun's "Race a BTC trading bot
live for 24 hours" bounty (btc-race-24h-20261118-1444, harness
`agent-fun/bars-replay/v1`). It trades cbBTC/USDC minute by minute against
$1,000 of paper money, long only, and is ranked by net PnL on the 24 hours
after the deadline; it races only if its dev-window grade made money.

## Strategy

A full-size round trip in this replay costs on the order of 26 bps (4 bps
fee and 2 bps of slippage a side, plus constant-product impact against a
pool about $1M deep), while a one-minute cbBTC close moves only a few bps.
Strategies that trade often pay that toll far more often than the market
pays it back. What a day-long window rewards is simply being long — so the
bot buys once, early, at full size, and holds.

The only trading after that is the disaster exit, which exists to keep the
entry inside the 25% drawdown guardrail on a collapse day:

- **Entry.** After 12 bars, buy with all the cash the weight cap allows.
  If the window opened mid-fall (close already more than 1.5% under the
  first close seen), wait until the trailing 60-bar return has stopped
  being negative. No new position in the last 40 batches.
- **Disaster exits** — either one sells everything and ends the bot's
  trading, with no re-entry:
  - the position is worth 7% less than it cost, at a close; or
  - the trailing 240-bar return is under −3%.
- **Slippage caps:** 200 bps on the entry, 500 bps on an exit.

The bot is a pure function of the bars it has been sent — no clock, no
environment, no randomness, integer comparisons throughout — so two
executions on the same window answer byte for byte the same.

## Run it

```sh
node main.ts
```

Graded locally with the kit's own grader:

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repo> --driver process
```

## Layout

- `main.ts` — the bot (Node 22, TypeScript with erasable syntax only). The
  grader runs it as `node /bot/main.ts`.
- `vendor/makefun-bars.ts` — the kit's bars-replay SDK shim, byte for byte
  as shipped in the kit (`sdk/makefun-bars.ts`, sha256
  9677370b0ab7e759c486a929afc95a11fb0fb32c7ec37053d3ebabd426aec5c8).

No dependencies, no install step, standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9xcq3bkm&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
