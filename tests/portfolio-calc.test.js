import { calcRebalancing, calcHoldingProfit, normalizePcts } from '../js/portfolio-calc.js';

describe('calcRebalancing', () => {
  const current = { stocksKr: 30_000_000, stocksUs: 50_000_000, crypto: 10_000_000, deposits: 10_000_000 };
  const total = 100_000_000;

  test('목표 비중과 현재 비중이 같으면 diffAmt=0', () => {
    const target = { stocksKr: 30, stocksUs: 50, crypto: 10, deposits: 10 };
    const result = calcRebalancing({ currentValues: current, targetPcts: target, totalAsset: total });
    expect(result.stocksKr.diffAmt).toBe(0);
    expect(result.stocksKr.action).toBe('유지');
  });

  test('목표가 높으면 매수', () => {
    const target = { stocksKr: 40, stocksUs: 40, crypto: 10, deposits: 10 };
    const result = calcRebalancing({ currentValues: current, targetPcts: target, totalAsset: total });
    expect(result.stocksKr.action).toBe('매수');
    expect(result.stocksKr.diffAmt).toBe(10_000_000);
    expect(result.stocksUs.action).toBe('매도');
    expect(result.stocksUs.diffAmt).toBe(-10_000_000);
  });

  test('5만원 미만 차이는 유지', () => {
    const target = { stocksKr: 30, stocksUs: 50, crypto: 10, deposits: 10 };
    const result = calcRebalancing({ currentValues: current, targetPcts: target, totalAsset: total });
    expect(result.deposits.action).toBe('유지');
  });

  test('currentPct 계산', () => {
    const target = { stocksKr: 30, stocksUs: 50, crypto: 10, deposits: 10 };
    const result = calcRebalancing({ currentValues: current, targetPcts: target, totalAsset: total });
    expect(result.stocksKr.currentPct).toBe(30);
  });
});

describe('calcHoldingProfit', () => {
  const holdings = [
    { name: '삼성전자', valueKrw: 1_000_000 },
    { name: 'Apple', valueKrw: 2_000_000 },
  ];
  const nhMap = {
    '삼성전자': { avgPrice: 70_000, quantity: 10 },
  };

  test('NH 데이터 있는 종목은 수익률 계산', () => {
    const result = calcHoldingProfit(holdings, nhMap);
    const samsung = result.find(h => h.name === '삼성전자');
    expect(samsung.costBasis).toBe(700_000);
    expect(samsung.profit).toBe(300_000);
    expect(samsung.profitPct).toBeCloseTo(42.9, 0);
  });

  test('NH 데이터 없는 종목은 profit null', () => {
    const result = calcHoldingProfit(holdings, nhMap);
    const apple = result.find(h => h.name === 'Apple');
    expect(apple.profit).toBeNull();
  });
});

describe('normalizePcts', () => {
  test('합이 100이 되도록 정규화', () => {
    const pcts = { stocksKr: 25, stocksUs: 50, crypto: 15, deposits: 10 };
    const result = normalizePcts(pcts);
    const sum = Object.values(result).reduce((s, v) => s + v, 0);
    expect(Math.abs(sum - 100)).toBeLessThan(1);
  });

  test('0 입력은 0 반환', () => {
    const pcts = { stocksKr: 0, stocksUs: 0, crypto: 0, deposits: 0 };
    const result = normalizePcts(pcts);
    expect(result.stocksKr).toBe(0);
  });
});
