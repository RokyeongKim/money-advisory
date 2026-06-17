export function calcMomentumScore(returns3m, returns6m) {
  const cumulative = (arr) =>
    arr.reduce((acc, r) => acc * (1 + r), 1) - 1;

  const score3m = returns3m.length >= 3 ? cumulative(returns3m) : 0;
  const score6m = returns6m.length >= 6 ? cumulative(returns6m) : 0;

  return score3m * 0.4 + score6m * 0.6;
}

export function calcRiskAdjustedScore(returns) {
  if (returns.length <= 1) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  return mean / stdDev;
}

export function calcRecommendedAllocation(assets) {
  const scored = assets.map((a) => ({
    ...a,
    combinedScore: a.momentumScore * 0.5 + a.riskAdjustedScore * 0.5,
  }));

  const min = Math.min(...scored.map((a) => a.combinedScore));
  const max = Math.max(...scored.map((a) => a.combinedScore));
  const range = max - min;

  const normalized = scored.map((a) => ({
    ...a,
    normalizedScore: range === 0 ? 0 : (a.combinedScore - min) / range,
  }));

  const total = normalized.reduce((acc, a) => acc + a.normalizedScore, 0);

  if (total === 0) {
    const equal = Math.round((100 / assets.length) * 10) / 10;
    return assets.map((a) => ({ id: a.id, recommendedWeightPct: equal }));
  }

  return normalized.map((a) => ({
    id: a.id,
    recommendedWeightPct:
      Math.round((a.normalizedScore / total) * 100 * 10) / 10,
  }));
}

export function checkRebalancingNeeded(
  currentWeights,
  recommendedWeights,
  threshold = 0.05
) {
  const recommendedMap = Object.fromEntries(
    recommendedWeights.map((r) => [r.id, r.weightPct])
  );

  return currentWeights
    .filter((c) => {
      const recommended = recommendedMap[c.id] ?? 0;
      return Math.abs(c.weightPct - recommended) / 100 >= threshold;
    })
    .map((c) => {
      const recommended = recommendedMap[c.id] ?? 0;
      return {
        id: c.id,
        currentPct: c.weightPct,
        recommendedPct: recommended,
        gapPct: Math.abs(c.weightPct - recommended),
      };
    });
}

export function calcCategoryReturnsFromHistory(categoryHistory, categoryId) {
  const sortedKeys = Object.keys(categoryHistory).sort();

  const values = sortedKeys.map((k) => categoryHistory[k][categoryId] ?? 0);

  const returns = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    if (prev === 0 || curr === 0) {
      returns.push(0);
    } else {
      returns.push((curr - prev) / prev);
    }
  }

  return {
    returns3m: returns.slice(-3),
    returns6m: returns.slice(-6),
  };
}
