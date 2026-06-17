import {
  calcTotalAsset,
  calcDailyChange,
  calcMonthlySpendingLimit,
  calcSavingSpeedChange,
  filterSpendingByDate,
} from '../js/calculations.js';

describe('calcTotalAsset', () => {
  test('모든 자산 합산', () => {
    expect(calcTotalAsset({ stocksKr: 10000000, stocksUs: 5000000, crypto: 3000000, deposits: 20000000 }))
      .toBe(38000000);
  });
  test('일부 항목 0일 때', () => {
    expect(calcTotalAsset({ stocksKr: 0, stocksUs: 0, crypto: 1000000, deposits: 5000000 }))
      .toBe(6000000);
  });
});

describe('calcDailyChange', () => {
  test('증가 케이스', () => {
    const r = calcDailyChange(11000000, 10000000);
    expect(r.amount).toBe(1000000);
    expect(r.pct).toBe(10);
  });
  test('prevTotal이 null이면 0 반환', () => {
    const r = calcDailyChange(5000000, null);
    expect(r.amount).toBe(0);
    expect(r.pct).toBe(0);
  });
});

describe('calcMonthlySpendingLimit', () => {
  test('5월 기준 — 잔여 8개월', () => {
    expect(calcMonthlySpendingLimit({
      annualIncome: 120000000,
      annualTargetAsset: 500000000,
      yearStartAsset: 400000000,
      currentMonth: 5,
    })).toBe(2500000);
  });
});

describe('calcSavingSpeedChange', () => {
  test('전월 대비 감소', () => {
    expect(calcSavingSpeedChange({ prevMonthNetIncrease: 5000000, currentMonthNetIncrease: 3000000 }))
      .toBe(-40);
  });
  test('전월 데이터 없으면 null', () => {
    expect(calcSavingSpeedChange({ prevMonthNetIncrease: null, currentMonthNetIncrease: 3000000 }))
      .toBeNull();
  });
});

describe('filterSpendingByDate', () => {
  const records = [
    { date: '2026-05-01', amount: 6000, category: '식비' },
    { date: '2026-05-15', amount: 30000, category: '교통' },
    { date: '2026-04-20', amount: 50000, category: '식비' },
  ];
  test('오늘 지출', () => {
    const r = filterSpendingByDate(records, 'today', '2026-05-01');
    expect(r).toHaveLength(1);
    expect(r[0].amount).toBe(6000);
  });
  test('당월 지출', () => {
    const r = filterSpendingByDate(records, 'month', '2026-05-15');
    expect(r).toHaveLength(2);
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(36000);
  });
  test('연간 지출', () => {
    expect(filterSpendingByDate(records, 'year', '2026-05-15')).toHaveLength(3);
  });
});

import {
  calcRetirementAsset,
  calcRetirementSurvivalYears,
  calcQuitNowSurvivalYears,
  calcRetirementDayCost,
} from '../js/calculations.js';

describe('calcRetirementAsset', () => {
  test('대출 없는 단순 케이스', () => {
    const result = calcRetirementAsset({
      currentFinancialAsset: 100_000_000,
      currentRealEstate: 500_000_000,
      annualIncome: 80_000_000,
      savingsRate: 0.55,
      incomeGrowthRate: 0.02,
      financialReturn: 0.08,
      realEstateReturn: 0.03,
      yearsToRetirement: 20,
      loanEvents: [],
    });
    expect(result).toBeGreaterThan(1_000_000_000);
  });

  test('대출 이벤트 있을 때 저축 감소 반영', () => {
    const withLoan = calcRetirementAsset({
      currentFinancialAsset: 100_000_000,
      currentRealEstate: 0,
      annualIncome: 80_000_000,
      savingsRate: 0.55,
      incomeGrowthRate: 0.02,
      financialReturn: 0.08,
      realEstateReturn: 0.03,
      yearsToRetirement: 20,
      loanEvents: [{ startYear: 1, monthlyPayment: 2_000_000, durationYears: 20 }],
    });
    const withoutLoan = calcRetirementAsset({
      currentFinancialAsset: 100_000_000,
      currentRealEstate: 0,
      annualIncome: 80_000_000,
      savingsRate: 0.55,
      incomeGrowthRate: 0.02,
      financialReturn: 0.08,
      realEstateReturn: 0.03,
      yearsToRetirement: 20,
      loanEvents: [],
    });
    expect(withLoan).toBeLessThan(withoutLoan);
  });
});

describe('calcRetirementSurvivalYears', () => {
  test('기본 생존 연수 계산', () => {
    const result = calcRetirementSurvivalYears(1_000_000_000, 3_000_000, 0.8);
    expect(result).toBeCloseTo(34.7, 0);
  });

  test('월지출 0이면 null 반환', () => {
    expect(calcRetirementSurvivalYears(1_000_000_000, 0, 0.8)).toBeNull();
  });
});

describe('calcRetirementDayCost', () => {
  test('지출이 은퇴일수에 미치는 영향 계산', () => {
    const days = calcRetirementDayCost({
      spendingAmount: 10_000,
      retirementAsset: 1_000_000_000,
      survivalYears: 34.7,
    });
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThan(1);
  });
});
