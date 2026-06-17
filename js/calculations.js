export function calcTotalAsset({ stocksKr, stocksUs, crypto, deposits, realEstate = 0, gold = 0 }) {
  return stocksKr + stocksUs + crypto + deposits + realEstate + gold;
}

export function calcDailyChange(currentTotal, prevTotal) {
  if (prevTotal == null || prevTotal === 0) return { amount: 0, pct: 0 };
  const amount = currentTotal - prevTotal;
  return { amount, pct: Math.round((amount / prevTotal) * 10000) / 100 };
}

export function calcMonthlySpendingLimit({ annualIncome, annualTargetAsset, yearStartAsset, currentMonth }) {
  const targetSavings = annualTargetAsset - yearStartAsset;
  const remainingMonths = 12 - (currentMonth - 1);
  return Math.round((annualIncome - targetSavings) / remainingMonths);
}

export function calcSavingSpeedChange({ prevMonthNetIncrease, currentMonthNetIncrease }) {
  if (prevMonthNetIncrease == null || prevMonthNetIncrease === 0) return null;
  return Math.round(((currentMonthNetIncrease - prevMonthNetIncrease) / prevMonthNetIncrease) * 100);
}

export function filterSpendingByDate(records, period, referenceDate) {
  const ref = new Date(referenceDate);
  return records.filter(({ date }) => {
    const d = new Date(date);
    if (period === 'today') return date === referenceDate;
    if (period === 'month') return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
    if (period === 'year') return d.getFullYear() === ref.getFullYear();
    return false;
  });
}

export function calcTimeToFreedom(netAsset, emergencyFund, avg3MonthSpending) {
  const freeAsset = netAsset - emergencyFund;
  if (avg3MonthSpending <= 0 || freeAsset <= 0) return null;
  const dailySpending = avg3MonthSpending / 30;
  return Math.floor(freeAsset / dailySpending);
}

export function calcWealthProjection(currentAsset, annualReturn, years = 20) {
  const startYear = new Date().getFullYear();
  return Array.from({ length: years + 1 }, (_, i) => ({
    year: startYear + i,
    value: Math.round(currentAsset * Math.pow(1 + annualReturn, i)),
  }));
}

export function calcRemainingBudgetToday(monthlyBudget, monthSpentSoFar) {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeftInMonth = lastDay - today.getDate() + 1;
  const remaining = monthlyBudget - monthSpentSoFar;
  const dailyBudget = Math.floor(Math.max(0, remaining) / daysLeftInMonth);
  return { remaining, dailyBudget };
}

export function calcAvg3MonthSpending(spendingRecords) {
  if (!spendingRecords || spendingRecords.length === 0) return 0;
  const today = new Date();
  const months = [0, 1, 2].map(offset => {
    const d = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const totals = months.map(({ year, month }) =>
    spendingRecords
      .filter(({ date }) => {
        const d = new Date(date);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .reduce((sum, { amount }) => sum + amount, 0)
  );
  return Math.round(totals.reduce((a, b) => a + b, 0) / 3);
}

export function calcTaxKrStock(tradeAmount) {
  return Math.round(tradeAmount * 0.002);
}

export function calcTaxForeignOrCrypto(gain) {
  const taxableGain = Math.max(0, gain - 2_500_000);
  return Math.round(taxableGain * 0.22);
}

export function calcRetirementAsset({
  currentFinancialAsset,
  currentRealEstate,
  annualIncome,
  savingsRate,
  incomeGrowthRate = 0.02,
  financialReturn,
  realEstateReturn = 0.03,
  yearsToRetirement,
  loanEvents = [],
}) {
  let accumulation = currentFinancialAsset * Math.pow(1 + financialReturn, yearsToRetirement);

  for (let k = 1; k <= yearsToRetirement; k++) {
    const yearlyIncome = annualIncome * Math.pow(1 + incomeGrowthRate, k - 1);
    const yearlyLoanPayment = loanEvents
      .filter(e => k >= e.startYear && k < e.startYear + e.durationYears)
      .reduce((sum, e) => sum + e.monthlyPayment * 12, 0);
    const yearlySavings = Math.max(0, yearlyIncome * savingsRate - yearlyLoanPayment);
    accumulation += yearlySavings * Math.pow(1 + financialReturn, yearsToRetirement - k);
  }

  const realEstateAtRetirement = currentRealEstate * Math.pow(1 + realEstateReturn, yearsToRetirement);
  return Math.round(accumulation + realEstateAtRetirement);
}

export function calcRetirementSurvivalYears(retirementAsset, currentMonthlyExpense, postRetirementRatio = 0.8) {
  const annualExpense = currentMonthlyExpense * postRetirementRatio * 12;
  if (annualExpense <= 0) return null;
  return Math.round((retirementAsset / annualExpense) * 10) / 10;
}

export function calcQuitNowSurvivalYears(currentTotalAsset, currentMonthlyExpense, postRetirementRatio = 0.8) {
  return calcRetirementSurvivalYears(currentTotalAsset, currentMonthlyExpense, postRetirementRatio);
}

export function calcRetirementDayCost({ spendingAmount, retirementAsset, survivalYears }) {
  if (!survivalYears || survivalYears <= 0 || retirementAsset <= 0) return null;
  const dailyAsset = retirementAsset / (survivalYears * 365);
  return Math.round((spendingAmount / dailyAsset) * 10) / 10;
}
