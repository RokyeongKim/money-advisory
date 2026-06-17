export const ASSET_KEYS = ['stocksKr', 'stocksUs', 'crypto', 'deposits'];
export const ASSET_LABELS = {
  stocksKr: '한국 주식',
  stocksUs: '해외 주식',
  crypto: '코인',
  deposits: '예금·현금',
};

/**
 * 리밸런싱 계산
 * @param {{ currentValues: object, targetPcts: object, totalAsset: number }} opts
 * @returns {{ [key]: { label, currentAmt, currentPct, targetPct, targetAmt, diffAmt, action } }}
 */
export function calcRebalancing({ currentValues, targetPcts, totalAsset }) {
  const result = {};
  for (const key of ASSET_KEYS) {
    const current = currentValues[key] ?? 0;
    const targetPct = targetPcts[key] ?? 0;
    const targetAmt = Math.round(totalAsset * targetPct / 100);
    const diffAmt = targetAmt - current;
    const absMin = 50000; // 5만원 미만은 유지
    result[key] = {
      label: ASSET_LABELS[key],
      currentAmt: current,
      currentPct: totalAsset > 0 ? Math.round((current / totalAsset) * 100 * 10) / 10 : 0,
      targetPct,
      targetAmt,
      diffAmt,
      action: Math.abs(diffAmt) < absMin ? '유지' : diffAmt > 0 ? '매수' : '매도',
    };
  }
  return result;
}

/**
 * NH CSV 데이터 기반 보유 종목 수익률 계산
 * @param {Array} holdings - 현재 보유 종목 배열 (valueKrw 또는 value_krw 포함)
 * @param {Object} nhMap - { [name]: { avgPrice, quantity } }
 */
export function calcHoldingProfit(holdings, nhMap) {
  return holdings.map(h => {
    const key = h.name ?? h.symbol ?? '';
    const nh = nhMap[key] ?? null;
    if (!nh || !nh.avgPrice || !nh.quantity) return { ...h, avgPrice: null, profit: null, profitPct: null };
    const costBasis = nh.avgPrice * nh.quantity;
    const currentValue = h.valueKrw ?? h.value_krw ?? 0;
    const profit = currentValue - costBasis;
    const profitPct = costBasis > 0 ? Math.round((profit / costBasis) * 1000) / 10 : null;
    return { ...h, avgPrice: nh.avgPrice, quantity: nh.quantity, costBasis, profit, profitPct };
  });
}

/**
 * 총 합이 100이 되도록 pct 배열을 정규화
 */
export function normalizePcts(pcts) {
  const total = Object.values(pcts).reduce((s, v) => s + (Number(v) || 0), 0);
  if (total === 0) return { ...pcts };
  const factor = 100 / total;
  const result = {};
  for (const [k, v] of Object.entries(pcts)) {
    result[k] = Math.round((Number(v) || 0) * factor * 10) / 10;
  }
  return result;
}
