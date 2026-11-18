// Anchorhold — a cbBTC bot for agent-fun/bars-replay/v1.
//
// The bet behind this bot is simple: over a single day, the only edge in
// this replay that is reliably bigger than the cost of trading is being long
// Bitcoin. A full-size round trip costs on the order of 26 bps once the 4 bps
// fee, the 2 bps of modelled slippage and the constant-product impact
// against a ~$1M-deep pool are all counted, while a typical one-minute close
// moves only a few bps. Anything that trades repeatedly pays that toll over
// and over; the kit's own active baselines (EMA cross, ADX momentum,
// RSI/Bollinger) all bled out exactly that way on the published dev window.
//
// So this bot buys once, early, at full size, and then does nothing except
// watch for the one scenario where holding is clearly wrong: a collapse.
// The exits exist to keep the entry inside the 25% drawdown guardrail on a
// disaster day, at the price of sitting out the rest of that day if they
// fire. There is no re-entry and no second trade, because every re-entry
// tried during development cost more than it saved.
//
// Decisions, all taken on a bar's close and filled at the next bar's open:
//
//   * Buy: after 12 bars have been seen, spend every USDC the weight cap
//     allows. If the window opened in the middle of a fall — the close
//     already more than 1.5% below the first close seen — hold off until
//     the trailing 60-bar return has stopped being negative, so the bot
//     does not step in front of a slide. No buy is ever placed once 1400
//     batches have gone by: that late, a round trip cannot pay for itself.
//   * Sell everything, once, if either disaster rule trips:
//       - the position is worth 7% less than it cost, at a close; or
//       - the trailing 240-bar return has fallen below -3% (a slow bleed
//         the value rule alone would ride a long way down).
//     After an exit the bot never trades again.
//   * Slippage caps: 200 bps on the buy, 500 bps on a sell, so an order is
//     refused rather than filled across a gap; the intent is simply
//     re-decided on the next bar that exists.
//
// The bot is a pure function of the bars it has been sent. No wall clock,
// no environment, no randomness; every ratio is compared by
// cross-multiplication on bigints, never by dividing into floats. Two runs
// on the same window therefore answer byte for byte the same. A batch that
// carries no CBBTC bar changes nothing: the close history advances only on
// bars that exist, and an order refused for a missing bar is re-decided on
// the next bar that comes.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const MARKET = 'CBBTC';

// How many closes to watch before the first buy is allowed. Twelve bars
// skips the opening minutes' noise while keeping the bot long for about
// 99% of the window.
const SETTLE_BARS = 12;
// A close this far under the first close seen means the window opened
// mid-fall (basis points).
const OPENING_FALL_BPS = 150n;
// While the opening-fall gate is holding the bot back, the trailing window
// (bars) whose return must have stopped being negative before it steps in.
const RECOVERY_BARS = 60;
// Disaster rule one: sell when the position is worth this share of its cost.
const VALUE_FLOOR_NUM = 93n;
const VALUE_FLOOR_DEN = 100n;
// Disaster rule two: sell when the trailing return over this many bars is
// worse than this (basis points).
const BLEED_BARS = 240;
const BLEED_BPS = 300n;
// No fresh position once this many batches have gone by (window: 1440).
const ENTRY_CUTOFF_SEQ = 1400;
// Slippage caps named on the orders themselves.
const BUY_SLIPPAGE_BPS = 200;
const SELL_SLIPPAGE_BPS = 500;

// Every CBBTC close seen so far, in arrival order. Gaps add nothing.
const tape: bigint[] = [];
// Latched once a disaster exit has been sent: the bot never buys again.
let liquidated = false;

/** The CBBTC close this batch carries, or null when the batch has none. */
function closeOf(batch: Batch): bigint | null {
  for (const bar of batch.bars) {
    if (bar.symbol === MARKET) return BigInt(bar.c);
  }
  return null;
}

/** True when `now` sits more than `bps` basis points below `then`. */
function fellMoreThan(now: bigint, then: bigint, bps: bigint): boolean {
  return now * 10_000n < then * (10_000n - bps);
}

/** The close `n` bars back, or null when the tape is too short. */
function closeBack(n: number): bigint | null {
  if (tape.length <= n) return null;
  return tape[tape.length - 1 - n];
}

/** One sell-everything order, and latch the bot closed for the window. */
function liquidate(qty: bigint): SellInput[] {
  liquidated = true;
  return [{ side: 'sell', symbol: MARKET, qty, max_slippage_bps: SELL_SLIPPAGE_BPS }];
}

/** One full-size buy, sized to the smaller of cash on hand and the room
 *  the weight cap leaves. */
function openPosition(state: BarsState): BuyInput[] {
  const room = state.weightRoom(MARKET);
  const spend = state.cash < room ? state.cash : room;
  if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
  return [{ side: 'buy', symbol: MARKET, notional_quote_units: spend, max_slippage_bps: BUY_SLIPPAGE_BPS }];
}

await runBars({
  onBatch(state, batch) {
    const close = closeOf(batch);
    if (close === null) return [];
    tape.push(close);
    if (state.warmingUp) return [];

    const held = state.positions.get(MARKET);
    if (held !== undefined) {
      // Disaster rule one: the position has lost 7% of what it cost.
      if (state.value(MARKET, held.qty) * VALUE_FLOOR_DEN <= held.cost * VALUE_FLOOR_NUM) {
        return liquidate(held.qty);
      }
      // Disaster rule two: a slow bleed, -3% over the trailing 240 bars.
      const old = closeBack(BLEED_BARS);
      if (old !== null && fellMoreThan(close, old, BLEED_BPS)) {
        return liquidate(held.qty);
      }
      return [];
    }

    if (liquidated || tape.length <= SETTLE_BARS || state.seq >= ENTRY_CUTOFF_SEQ) return [];
    if (fellMoreThan(close, tape[0], OPENING_FALL_BPS)) {
      // The window opened mid-fall: step in only once the last hour of
      // bars has stopped falling.
      const hourAgo = closeBack(RECOVERY_BARS);
      if (hourAgo === null || close < hourAgo) return [];
    }
    return openPosition(state);
  },
});
