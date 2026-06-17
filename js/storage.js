const K = {
  SETTINGS: 'ad_settings',
  TOSS_ASSETS: 'ad_toss_assets',
  TOSS_SPENDING: 'ad_toss_spending',
  SNAPSHOTS: 'ad_snapshots',
  CATEGORY_SNAPSHOTS: 'ad_category_snapshots',
  STRATEGY_CACHE: 'ad_strategy_cache',
  REALESTATE: 'ad_realestate',
  OB_SPENDING: 'ad_ob_spending',
  LOCATIONS: 'ad_locations',
  TARGET_ALLOC: 'ad_target_alloc',
  NH_HOLDINGS: 'ad_nh_holdings',
  UPBIT_KEYS: 'ad_upbit_keys',
  RE_BUDGET: 'ad_re_budget',
  PORTFOLIO_KR: 'ad_portfolio_kr',
  PORTFOLIO_US: 'ad_portfolio_us',
  MANUAL_ASSETS: 'ad_manual_assets',
};

export const storage = {
  getSettings() {
    return JSON.parse(localStorage.getItem(K.SETTINGS) || 'null') ?? {
      annualTargetAsset: 0,
      annualIncome: 0,
      yearStartAsset: 0,
      emergencyFund: 0,
      optimisticReturn: 0.08,
      pessimisticReturn: 0.02,
      monthlyBudget: 0,
      currentAge: 35,
      retirementAge: 55,
      savingsRate: 0.55,
      incomeGrowthRate: 0.02,
      realEstateReturn: 0.03,
      postRetirementExpenseRatio: 0.8,
      alertSurvivalYears: 20,
      loanEvents: [],
      totalDebt: 0,
    };
  },
  setSettings(data) {
    localStorage.setItem(K.SETTINGS, JSON.stringify(data));
  },

  getTossAssets() {
    return JSON.parse(localStorage.getItem(K.TOSS_ASSETS) || 'null') ?? {
      uploadedAt: null, deposits: 0, savings: 0, cash: 0,
    };
  },
  setTossAssets(data) {
    localStorage.setItem(K.TOSS_ASSETS, JSON.stringify(data));
  },

  getTossSpending() {
    return JSON.parse(localStorage.getItem(K.TOSS_SPENDING) || 'null') ?? {
      uploadedAt: null, records: [],
    };
  },
  setTossSpending(data) {
    localStorage.setItem(K.TOSS_SPENDING, JSON.stringify(data));
  },

  getSnapshots() {
    return JSON.parse(localStorage.getItem(K.SNAPSHOTS) || '{}');
  },
  setSnapshot(yearMonth, totalValue) {
    const snaps = this.getSnapshots();
    snaps[yearMonth] = totalValue;
    localStorage.setItem(K.SNAPSHOTS, JSON.stringify(snaps));
  },

  getCategorySnapshots() {
    return JSON.parse(localStorage.getItem(K.CATEGORY_SNAPSHOTS) || '{}');
  },
  setCategorySnapshot(yearMonth, values) {
    const snaps = this.getCategorySnapshots();
    snaps[yearMonth] = values;
    localStorage.setItem(K.CATEGORY_SNAPSHOTS, JSON.stringify(snaps));
  },

  getStrategyCache() {
    return JSON.parse(localStorage.getItem(K.STRATEGY_CACHE) || 'null');
  },
  setStrategyCache(data) {
    localStorage.setItem(K.STRATEGY_CACHE, JSON.stringify(data));
  },

  getRealestateSettings() {
    return JSON.parse(localStorage.getItem(K.REALESTATE) || 'null') ?? {
      watchList: [],
      weights: { commute: 15, school: 25, transit: 20, development: 15, commercial: 10, price: 8, supply: 4, infra: 1, forest: 2 },
      preset: 'residential',
      investmentBudget: { min: 0, max: 0 },
    };
  },
  setRealestateSettings(data) {
    localStorage.setItem(K.REALESTATE, JSON.stringify(data));
  },

  getObSpending() {
    return JSON.parse(localStorage.getItem(K.OB_SPENDING) || 'null') ?? { uploadedAt: null, records: [] };
  },
  setObSpending(data) {
    localStorage.setItem(K.OB_SPENDING, JSON.stringify(data));
  },

  getLocationSettings() {
    const saved = JSON.parse(localStorage.getItem(K.LOCATIONS) || 'null') ?? {};
    return {
      myCompany:     saved.myCompany     || '',
      spouseCompany: saved.spouseCompany || '',
      parentsHome:   saved.parentsHome   || '',
    };
  },
  setLocationSettings(data) {
    localStorage.setItem(K.LOCATIONS, JSON.stringify(data));
  },

  getTargetAllocation() {
    return JSON.parse(localStorage.getItem(K.TARGET_ALLOC) || 'null') ?? {
      buffett:  { stocksKr: 0,  stocksUs: 90, crypto: 0,  deposits: 10 },
      mer:      { stocksKr: 30, stocksUs: 30, crypto: 10, deposits: 30 },
      custom:   { stocksKr: 25, stocksUs: 40, crypto: 10, deposits: 25 },
    };
  },
  setTargetAllocation(data) {
    localStorage.setItem(K.TARGET_ALLOC, JSON.stringify(data));
  },

  getNhHoldings() {
    return JSON.parse(localStorage.getItem(K.NH_HOLDINGS) || 'null') ?? { uploadedAt: null, holdings: {} };
  },
  setNhHoldings(data) {
    localStorage.setItem(K.NH_HOLDINGS, JSON.stringify(data));
  },

  getUpbitKeys() {
    return JSON.parse(localStorage.getItem(K.UPBIT_KEYS) || 'null') ?? { accessKey: '', secretKey: '' };
  },
  setUpbitKeys(data) {
    localStorage.setItem(K.UPBIT_KEYS, JSON.stringify(data));
  },

  getReBudgetSettings() {
    return JSON.parse(localStorage.getItem(K.RE_BUDGET) || 'null') ?? {
      purchaseDate: '',
      companyLoanEok: 0,
      extraCash: 0,
      selectedAssets: { knkDeposits: true, lchDeposits: true, apt: true, stocks: false, gold: false, upbit: false },
      isFirstHome: false,
      zone: 'overheated',
      targetPrice: 0,
      loanRate: 3.7,
      loanTermYears: 30,
    };
  },
  setReBudgetSettings(data) {
    localStorage.setItem(K.RE_BUDGET, JSON.stringify(data));
  },

  // ── 사용자 포트폴리오 (브라우저 localStorage에 저장) ──────────────────────
  getPortfolioKr() {
    return JSON.parse(localStorage.getItem(K.PORTFOLIO_KR) || 'null') ?? [];
  },
  setPortfolioKr(holdings) {
    localStorage.setItem(K.PORTFOLIO_KR, JSON.stringify(holdings));
  },

  getPortfolioUs() {
    return JSON.parse(localStorage.getItem(K.PORTFOLIO_US) || 'null') ?? [];
  },
  setPortfolioUs(holdings) {
    localStorage.setItem(K.PORTFOLIO_US, JSON.stringify(holdings));
  },

  // ── 수동 입력 자산 (예금합계, 아파트, 금) ──────────────────────────────────
  getManualAssets() {
    return JSON.parse(localStorage.getItem(K.MANUAL_ASSETS) || 'null') ?? {
      deposits: 0,
      apartment: 0,
      goldDons: 0,
    };
  },
  setManualAssets(data) {
    localStorage.setItem(K.MANUAL_ASSETS, JSON.stringify(data));
  },

  isFirstVisit() {
    const kr = this.getPortfolioKr();
    const us = this.getPortfolioUs();
    const manual = this.getManualAssets();
    return kr.length === 0 && us.length === 0 && manual.deposits === 0 && manual.apartment === 0 && manual.goldDons === 0;
  },
};
