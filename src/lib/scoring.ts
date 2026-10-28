import type { AppState, Candidate, Comparable, Goal, Merchant, Sale } from './model';
import { itemKey } from './model';
const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const norm = (s: string) => s.toLowerCase().trim();
export function matchingComps(item: Candidate, comps: Comparable[], now = new Date()) {
  return comps.filter(
    (c) =>
      c.key === itemKey(item) &&
      c.condition === item.condition &&
      c.kind === 'sold' &&
      c.price > 0 &&
      new Date(c.date) <= now &&
      now.getTime() - new Date(c.date).getTime() <= 90 * 86400000,
  );
}
export function pricing(
  item: Candidate,
  comps: Comparable[],
  merchant: Merchant,
  now = new Date(),
) {
  const sold = matchingComps(item, comps, now);
  if (!sold.length) return null;
  const prices = sold.map((c) => c.price).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  const net = (p: number) =>
    p * (1 - merchant.feePercent / 100) -
    merchant.fixedFee -
    merchant.shipping -
    merchant.handling -
    item.cost -
    item.repair;
  return {
    sold,
    low: prices[0],
    high: prices.at(-1)!,
    median,
    profit: net(median),
    lowProfit: net(prices[0]),
    highProfit: net(prices.at(-1)!),
    breakEven:
      (item.cost + item.repair + merchant.shipping + merchant.handling + merchant.fixedFee) /
      (1 - merchant.feePercent / 100),
    confidence: sold.some((c) => c.source === 'demo')
      ? 'Illustrative'
      : sold.length < 5
        ? 'Low · small sample'
        : 'Moderate · user-entered',
  };
}
export function merchantScore(
  item: Candidate,
  comps: Comparable[],
  merchant: Merchant,
  sales: Sale[],
  now = new Date(),
) {
  const estimate = pricing(item, comps, merchant, now);
  const history = sales.filter(
    (s) => !s.demo && s.category === item.category && norm(s.store) === norm(item.store),
  );
  const wins = history.filter(
    (s) => s.soldFor - s.cost - s.expenses >= merchant.targetProfit,
  ).length;
  if (!estimate)
    return {
      score: null,
      reasons: ['Add a recent, sold comparable in the same condition to estimate resale value.'],
      history: history.length,
      wins,
      estimate,
    };
  const condition = { Excellent: 15, Good: 12, Fair: 5, Poor: 0 }[item.condition];
  const margin = estimate.median ? (estimate.profit / estimate.median) * 100 : 0;
  const score = clamp(
    Math.min(45, Math.max(0, (estimate.profit / Math.max(1, merchant.targetProfit)) * 35)) +
      (margin >= merchant.minMargin
        ? 15
        : Math.max(0, (margin / Math.max(1, merchant.minMargin)) * 15)) +
      condition +
      (merchant.niche === item.category ? 15 : 4) +
      (history.length ? (wins / history.length) * 10 : 5),
  );
  return {
    score,
    estimate,
    history: history.length,
    wins,
    reasons: [
      estimate.profit >= merchant.targetProfit
        ? 'Meets your target profit after estimated costs.'
        : 'Below your target profit after estimated costs.',
      merchant.niche === item.category ? 'Fits your shop’s focus.' : 'Outside your shop’s focus.',
      history.length
        ? `${wins} of ${history.length} similar sales from this source met your target.`
        : 'No personal sales history for this category and source yet.',
    ],
  };
}
export function householdScore(item: Candidate, state: AppState) {
  const duplicates = state.inventory.filter(
    (i) => i.mode === 'household' && i.status === 'Owned' && itemKey(i) === itemKey(item),
  );
  const matches = state.goals
    .filter((g) => !g.fulfilled && g.category === item.category)
    .map((goal) => {
      const size = !goal.size || (!!item.size && norm(item.size) === norm(goal.size));
      const color = !goal.color || (!!item.color && norm(item.color) === norm(goal.color));
      const theme = !goal.theme || (!!item.theme && norm(item.theme) === norm(goal.theme));
      const withinBudget = item.cost + item.repair <= goal.budget;
      const duplicate = duplicates.some(
        (i) => i.ownerId === goal.personId && norm(i.size) === norm(item.size),
      );
      const score = clamp(
        25 +
          (size ? 25 : 0) +
          (withinBudget ? 20 : 0) +
          (color ? 10 : 0) +
          (theme ? 10 : 0) +
          (goal.priority === 'Soon' ? 10 : 5) -
          (duplicate ? 35 : 0) -
          (item.condition === 'Poor' ? 30 : item.condition === 'Fair' ? 10 : 0),
      );
      return {
        goal,
        score: !size ? Math.min(score, 45) : score,
        size,
        color,
        theme,
        withinBudget,
        duplicate,
      };
    })
    .sort((a, b) => b.score - a.score);
  const best = matches[0];
  return {
    score: best?.score ?? null,
    matches,
    best,
    duplicates,
    reasons: best
      ? [
          best.size
            ? 'Size matches the shopping goal.'
            : 'Size mismatch or unknown: check measurements.',
          best.withinBudget
            ? 'Purchase and repairs fit the goal budget.'
            : 'Purchase and repairs exceed the goal budget.',
          best.duplicate
            ? 'You already own a matching item for this person.'
            : 'No exact duplicate for this person.',
          best.color && best.theme
            ? 'Color and theme match.'
            : 'Color or theme differs from the goal.',
        ]
      : ['Add a shopping goal in this category for a personal match.'],
  };
}
export function goalLabel(goal: Goal, state: AppState) {
  return state.profiles.find((p) => p.id === goal.personId)?.name ?? 'Household';
}
