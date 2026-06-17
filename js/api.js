import { storage } from './storage.js';

// ─── 실시간 주가 조회 (Vercel 서버리스 API 경유) ────────────────────────────
async function fetchLiveStockPrices(tickers) {
  if (!tickers.length) return {};
  try {
    const res = await fetch(`/api/stock-price?tickers=${encodeURIComponent(tickers.join(','))}`);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchStocksData() {
  const krHoldings = storage.getPortfolioKr();
  const usHoldings = storage.getPortfolioUs();

  const krTickers = krHoldings.map(h => `${h.ticker}.KS`);
  const usTickers = usHoldings.map(h => h.ticker);
  const allTickers = [...krTickers, ...usTickers];

  const [prices, usdKrw] = await Promise.all([
    fetchLiveStockPrices(allTickers),
    fetchUsdKrw(),
  ]);

  const krResult = krHoldings.map(h => {
    const key = `${h.ticker}.KS`;
    const live = prices[key];
    const currentPrice = live?.price ?? h.avg_price_krw ?? 0;
    const changePct = live?.changePct ?? 0;
    return {
      ticker: h.ticker,
      name: h.name,
      shares: h.shares,
      avg_price_krw: h.avg_price_krw ?? 0,
      current_price: currentPrice,
      value_krw: Math.round(currentPrice * h.shares),
      daily_change_pct: changePct,
      account: h.account ?? '',
    };
  });

  const usResult = usHoldings.map(h => {
    const live = prices[h.ticker];
    const currentPriceUsd = live?.price ?? 0;
    const currentPriceKrw = Math.round(currentPriceUsd * usdKrw);
    const avgPriceKrw = h.avg_price_krw ?? 0;
    const changePct = live?.changePct ?? 0;
    return {
      ticker: h.ticker,
      name: h.name,
      shares: h.shares,
      avg_price_krw: avgPriceKrw,
      current_price_usd: currentPriceUsd,
      current_price: currentPriceKrw,
      value_krw: Math.round(currentPriceKrw * h.shares),
      value_usd: Math.round(currentPriceUsd * h.shares * 100) / 100,
      daily_change_pct: changePct,
    };
  });

  const krTotal = krResult.reduce((s, h) => s + h.value_krw, 0);
  const usTotal = usResult.reduce((s, h) => s + h.value_krw, 0);
  const usTotalUsd = usResult.reduce((s, h) => s + h.value_usd, 0);

  return {
    kr: {
      holdings: krResult,
      total_value_krw: krTotal,
      updated_at: new Date().toISOString(),
    },
    us: {
      holdings: usResult,
      total_value_krw: usTotal,
      total_value_usd: Math.round(usTotalUsd * 100) / 100,
      usd_krw: usdKrw,
      updated_at: new Date().toISOString(),
    },
  };
}

export async function fetchCryptoPrices(cryptoPortfolio) {
  const active = (cryptoPortfolio ?? []).filter(c => c.amount > 0);
  if (!active.length) return { holdings: [], totalValueKrw: 0 };

  const ids = active.map(c => c.id).join(',');
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=krw&include_24h_change=true`
    );
    const data = await res.json();
    const holdings = active.map(c => {
      const info = data[c.id] || {};
      const priceKrw = info.krw ?? 0;
      const change = info.krw_24h_change ?? 0;
      return {
        id: c.id,
        symbol: c.symbol,
        amount: c.amount,
        priceKrw,
        valueKrw: Math.round(priceKrw * c.amount),
        dailyChangePct: Math.round(change * 100) / 100,
      };
    });
    return { holdings, totalValueKrw: holdings.reduce((s, h) => s + h.valueKrw, 0) };
  } catch {
    return { holdings: [], totalValueKrw: 0 };
  }
}

export async function fetchUsdKrw() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    return data.rates.KRW;
  } catch {
    return 1380;
  }
}

export async function fetchCryptoPricesUsd(cryptoPortfolio) {
  const active = (cryptoPortfolio ?? []).filter(c => c.amount > 0);
  if (!active.length) return { holdings: [], totalValueKrw: 0, totalValueUsd: 0 };

  const ids = active.map(c => c.id).join(',');
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=krw,usd&include_24h_change=true`
    );
    const data = await res.json();
    const holdings = active.map(c => {
      const info = data[c.id] || {};
      const priceKrw = info.krw ?? 0;
      const priceUsd = info.usd ?? 0;
      const change = info.krw_24h_change ?? 0;
      return {
        id: c.id,
        symbol: c.symbol,
        amount: c.amount,
        priceKrw,
        priceUsd,
        valueKrw: Math.round(priceKrw * c.amount),
        valueUsd: Math.round(priceUsd * c.amount * 100) / 100,
        dailyChangePct: Math.round(change * 100) / 100,
      };
    });
    return {
      holdings,
      totalValueKrw: holdings.reduce((s, h) => s + h.valueKrw, 0),
      totalValueUsd: Math.round(holdings.reduce((s, h) => s + h.valueUsd, 0) * 100) / 100,
    };
  } catch {
    return { holdings: [], totalValueKrw: 0, totalValueUsd: 0 };
  }
}

export async function fetchAllAssets() {
  const [stocks, usdKrw] = await Promise.all([
    fetchStocksData(),
    fetchUsdKrw(),
  ]);
  const crypto = { holdings: [], totalValueKrw: 0, totalValueUsd: 0 };
  return { stocks, crypto, usdKrw };
}

export async function fetchRealestate() {
  try {
    return await fetch('data/realestate.json').then(r => r.json());
  } catch {
    return { updatedAt: null, complexes: [] };
  }
}

export async function fetchSignals() {
  try {
    return await fetch('data/signals.json').then(r => r.json());
  } catch {
    return { updatedAt: null, regions: [] };
  }
}

export async function fetchPolicies() {
  try {
    return await fetch('data/policies.json').then(r => r.json());
  } catch {
    return { updatedAt: null, policies: [] };
  }
}

export async function fetchSpending() {
  return { records: [], updatedAt: null };
}

// 예금/아파트: localStorage에서 읽기
export async function fetchDeposits() {
  const manual = storage.getManualAssets();
  const amount = manual.deposits ?? 0;
  return {
    updatedAt: null,
    items: amount > 0 ? [{ type: '예금·적금', amount, owner: '나', institution: '' }] : [],
    totalKnk: amount,
    totalLch: 0,
    grandTotal: amount,
  };
}

export async function fetchHomePrice() {
  const manual = storage.getManualAssets();
  return {
    updatedAt: null,
    aptName: manual.aptName ?? '',
    estimatedValue: manual.apartment ?? 0,
    recentTrade: null,
    note: '',
  };
}

// 금: localStorage 보유 돈수 + 실시간 시세
export async function fetchGold() {
  const GRAMS_PER_DON = 3.75, GRAMS_PER_OZ = 31.1035;
  const manual = storage.getManualAssets();
  const DONS = manual.goldDons ?? 0;
  const totalGrams = DONS * GRAMS_PER_DON;

  if (DONS === 0) return { totalValueKrw: 0, dons: 0, grams: 0 };

  try {
    const [spots, fx] = await Promise.all([
      fetch('https://metals.live/api/v1/spot').then(r => r.json()),
      fetch('https://api.exchangerate-api.com/v4/latest/USD').then(r => r.json()),
    ]);
    const goldUsdPerOz = Number(spots[0]?.gold ?? 0);
    const usdKrw = Number(fx.rates?.KRW ?? 1380);
    const priceKrwPerGram = Math.round(goldUsdPerOz / GRAMS_PER_OZ * usdKrw);
    return {
      updatedAt: new Date().toISOString(),
      dons: DONS, grams: totalGrams,
      priceUsdPerOz: goldUsdPerOz, usdKrw,
      priceKrwPerGram,
      priceKrwPerDon: Math.round(priceKrwPerGram * GRAMS_PER_DON),
      totalValueKrw: Math.round(goldUsdPerOz * (totalGrams / GRAMS_PER_OZ) * usdKrw),
    };
  } catch (_) {
    return { totalValueKrw: 0, dons: DONS, grams: totalGrams };
  }
}

export async function fetchUpbitBalance() {
  return { holdings: [], totalPurchaseKrw: 0, totalEvalKrw: 0, error: null };
}

export async function fetchWatchlist() {
  try {
    return await fetch('data/watchlist.json').then(r => r.json());
  } catch {
    return { updatedAt: null, items: [] };
  }
}
