import { storage } from './storage.js';
import { fetchAllAssets, fetchSpending, fetchDeposits, fetchHomePrice, fetchGold, fetchUpbitBalance } from './api.js';
import { renderRealestateInline, setRealestateAssetCtx } from './realestate.js';
import { renderPortfolioInline } from './portfolio.js';
import {
  calcTotalAsset, calcDailyChange,
  calcRetirementAsset, calcRetirementSurvivalYears, calcRetirementDayCost,
  calcAvg3MonthSpending, calcRemainingBudgetToday,
  filterSpendingByDate,
} from './calculations.js';
import {
  renderAllocationDonut, renderRetirementProjectionChart,
  renderDebtEquityBar,
} from './charts.js';
import { renderSettings } from './settings.js';

let _seedBarsChart = null;
let _trendMode = 'seed';
let _appCtx = null;
let _retCtx = null;
let _dailyEditIdx = -1;
let _dailyChartCat = null;
let _dailyChartPayer = null;
let _dailyChartsVisible = false;
let _dailySelectedYM = null;

const KNK_CATS = ['롯데카드', '하나복지', '네이버', '계좌이체', '현금', '기타'];
const LCH_CATS = ['우리카드', '네이버', '현금', '계좌이체', '기타'];

async function main() {
  const settings = storage.getSettings();

  const [assets, depositsData, homeData, goldData] = await Promise.all([
    fetchAllAssets(),
    fetchDeposits(),
    fetchHomePrice(),
    fetchGold(),
  ]);

  const { stocks, crypto } = assets;
  const tossAssets = storage.getTossAssets();
  const depositsTotal = depositsData.grandTotal ?? 0;
  const realEstateValue = homeData.estimatedValue ?? 0;
  const goldValue = goldData.totalValueKrw ?? 0;
  const upbitValue = 0;
  const total = calcTotalAsset({
    stocksKr: stocks.kr.total_value_krw,
    stocksUs: stocks.us.total_value_krw,
    crypto: 0,
    deposits: depositsTotal,
    realEstate: realEstateValue,
    gold: goldValue,
  });

  const csvRecords = storage.getTossSpending().records ?? [];
  const allSpendingRecords = csvRecords;
  const monthlyAvgExpense = calcAvg3MonthSpending(allSpendingRecords);

  cacheStocksForPortfolio(stocks);
  autoSnapshot(total, stocks, crypto, depositsTotal);

  const ctx = { stocks, crypto, tossAssets, depositsTotal, depositsData, homeData, realEstateValue, goldData, goldValue, upbitData: { totalEvalKrw: 0 }, upbitValue, settings, total, allSpendingRecords, monthlyAvgExpense };
  _appCtx = ctx;

  renderAssetsTab(ctx);
  renderSpendTab(ctx);
  renderSettings(storage);
  setupSettingsToggle();
  setupTabs();

  if (storage.isFirstVisit()) {
    document.getElementById('onboarding-banner')?.classList.remove('hidden');
  }
}

// ─── 탭 전환 ──────────────────────────────────────────────────────────────────

function setupTabs() {
  const TABS = ['assets', 'spend', 'grow'];
  let growLoaded = false;

  document.querySelectorAll('.main-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.tab;

      document.querySelectorAll('.main-tab').forEach(t => {
        const active = t === btn;
        t.classList.toggle('text-white', active);
        t.classList.toggle('bg-gray-800', active);
        t.classList.toggle('text-gray-400', !active);
      });

      TABS.forEach(t => document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== key));

      if (key === 'grow' && !growLoaded) {
        growLoaded = true;
        renderGrowTab();
      }
    });
  });

  document.querySelector('[data-tab="assets"]').click();
}

function setupSettingsToggle() {
  document.getElementById('btn-settings-toggle').addEventListener('click', () => {
    document.getElementById('settings-panel').classList.toggle('hidden');
  });
}

async function renderGrowTab() {
  if (_appCtx) setRealestateAssetCtx(_appCtx);
  await renderRealestateInline('realestate-inline');
  await renderPortfolioInline('portfolio-inline');
}

// ─── 은퇴 시나리오 렌더 (입력 변경 시 재호출) ─────────────────────────────────────

function renderRetirementSection(retAge, monthlyExpWon, retEstateEok) {
  if (!_retCtx) return;
  const { total, realEstateValue, settings, tossAssets, effectiveAnnualIncome } = _retCtx;
  const currentAge = settings.currentAge ?? 35;
  const n = Math.max(0, retAge - currentAge);
  const retEstateWon = retEstateEok * 1e8;
  const savingsRate = settings.savingsRate ?? 0.55;
  const realEstateReturn = settings.realEstateReturn ?? 0.03;
  const loanEvents = settings.loanEvents ?? [];
  const _fmt = v => v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : `${Math.round(v / 1e4)}만`;
  const _fmtYrs = y => y != null ? `${y.toFixed(1)}년` : '--';

  // 지금 퇴사 카드
  const liquidTotal = Math.max(0, total - realEstateValue);
  const survNow = monthlyExpWon > 0 ? Math.round(liquidTotal / (monthlyExpWon * 12) * 10) / 10 : null;
  document.getElementById('quit-now-preview').innerHTML = `
    <div class="text-2xl font-bold ${survNow !== null && survNow < 20 ? 'text-red-400' : 'text-yellow-400'}">
      ${survNow !== null ? `${survNow.toFixed(1)}년` : '--년'}
    </div>
    <div class="text-[10px] text-gray-500 mt-1">금융자산 ${_fmt(liquidTotal)} ÷ 월${Math.round(monthlyExpWon / 1e4)}만×12</div>
    <div class="text-[9px] text-gray-600 mt-0.5 italic">* 부동산 ${_fmt(realEstateValue)} 제외</div>`;

  // 수익률별 시나리오 계산
  const RATES = [0.08, 0.06, 0.04, 0.02];
  const scenarios = RATES.map(r => {
    const retAsset = calcRetirementAsset({
      currentFinancialAsset: total,
      currentRealEstate: tossAssets.realEstate ?? 0,
      annualIncome: effectiveAnnualIncome,
      savingsRate,
      financialReturn: r,
      realEstateReturn,
      yearsToRetirement: n,
      loanEvents,
    });
    const assetGrowth  = Math.round(total * Math.pow(1 + r, n));
    const reGrowth     = Math.round((tossAssets.realEstate ?? 0) * Math.pow(1 + realEstateReturn, n));
    const incomeSavings = retAsset - assetGrowth - reGrowth;
    const netFinancial  = Math.max(0, retAsset - retEstateWon);
    const survYrs = monthlyExpWon > 0 ? Math.round(netFinancial / (monthlyExpWon * 12) * 10) / 10 : null;
    return { r, retAsset, assetGrowth, incomeSavings, netFinancial, survYrs };
  });

  // 우측 카드 요약 (8% 기준)
  const opt8 = scenarios[0];
  document.getElementById('retirement-preview').innerHTML = `
    <div class="text-2xl font-bold ${opt8.survYrs !== null && opt8.survYrs >= 30 ? 'text-green-400' : 'text-yellow-400'}">
      ${_fmtYrs(opt8.survYrs)}
    </div>
    <div class="text-[10px] text-gray-500 mt-1">8% 기준 · 아래 표에서 수익률별 확인 ↓</div>
    <div class="text-[10px] text-gray-400 mt-1">순금융자산 <span class="text-blue-400 font-semibold">${_fmt(opt8.netFinancial)}</span></div>
    <div class="text-[9px] text-gray-600 mt-0.5 italic">* 부동산 ${retEstateEok}억 제외</div>`;

  // 시나리오 테이블
  const colorYrs = y => y === null ? 'text-gray-400' : y >= 50 ? 'text-green-400 font-bold' : y >= 25 ? 'text-yellow-400' : 'text-red-400';
  document.getElementById('retirement-table-wrap').innerHTML = `
    <div class="text-[11px] text-gray-400 mb-3">
      수익률별 은퇴 시나리오 &nbsp;·&nbsp;
      <span class="text-white font-semibold">${retAge}세</span> 은퇴
      (${n > 0 ? `${n}년 후` : '지금'} &nbsp;·&nbsp; 월지출 <span class="text-white">${Math.round(monthlyExpWon / 1e4)}만원</span> 가정)
    </div>
    <table class="w-full text-xs min-w-[460px]">
      <thead>
        <tr class="text-gray-500 border-b border-gray-700 text-right">
          <th class="pb-2 text-left font-medium pr-3 whitespace-nowrap">구분</th>
          ${RATES.map(r => `<th class="pb-2 px-2 font-medium">${Math.round(r * 100)}%</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        <tr class="border-b border-gray-700/40">
          <td class="py-1.5 pr-3 text-gray-500 whitespace-nowrap">자산 성장분</td>
          ${scenarios.map(s => `<td class="py-1.5 px-2 text-right text-gray-300">${_fmt(s.assetGrowth)}</td>`).join('')}
        </tr>
        <tr class="border-b border-gray-700/40">
          <td class="py-1.5 pr-3 text-gray-500 whitespace-nowrap">소득 저축 누적</td>
          ${scenarios.map(s => `<td class="py-1.5 px-2 text-right text-gray-300">${_fmt(s.incomeSavings)}</td>`).join('')}
        </tr>
        <tr class="border-b border-gray-700 bg-gray-700/30">
          <td class="py-2 pr-3 text-gray-200 font-semibold whitespace-nowrap">은퇴 총자산</td>
          ${scenarios.map(s => `<td class="py-2 px-2 text-right text-white font-semibold">${_fmt(s.retAsset)}</td>`).join('')}
        </tr>
        <tr class="border-b border-gray-700/40">
          <td class="py-1.5 pr-3 text-gray-500 whitespace-nowrap">순금융자산 <span class="text-gray-600 text-[10px]">(-${retEstateEok}억)</span></td>
          ${scenarios.map(s => `<td class="py-1.5 px-2 text-right text-blue-400">${_fmt(s.netFinancial)}</td>`).join('')}
        </tr>
        <tr>
          <td class="py-2.5 pr-3 text-gray-200 font-semibold whitespace-nowrap">재무유지 가능기간</td>
          ${scenarios.map(s => `<td class="py-2.5 px-2 text-right text-base ${colorYrs(s.survYrs)}">${_fmtYrs(s.survYrs)}</td>`).join('')}
        </tr>
      </tbody>
    </table>
    <div class="text-[9px] text-gray-600 mt-2 italic">* 부동산 ${retEstateEok}억 거주 필수 자산으로 제외 · 입력한 월지출 직접 사용</div>`;
}

// ─── TAB 1: 자산현황 ───────────────────────────────────────────────────────────

function renderAssetsTab(ctx) {
  const { stocks, crypto, tossAssets, depositsTotal, depositsData, homeData, realEstateValue, goldData, goldValue, upbitData, upbitValue, settings, total, monthlyAvgExpense } = ctx;
  const snaps = storage.getSnapshots();
  const sortedKeys = Object.keys(snaps).sort();
  const currentYear = new Date().getFullYear();
  const yearsToRetirementChart = Math.max(0, (settings.retirementAge ?? 55) - (settings.currentAge ?? 35));

  // 씨앗 탭 수동 데이터 폴백 — seed_income_detail / seed_monthly_expense
  const _retSeedDet = JSON.parse(localStorage.getItem('seed_income_detail') || 'null');
  const _retKnkM = (_retSeedDet?.knk?.salary || 0) * 10000;
  const _retLchM = (_retSeedDet?.lch?.salary || 0) * 10000;
  const seedAnnualIncome = (_retKnkM + _retLchM) > 0 ? (_retKnkM + _retLchM) * 12 : 0;
  const effectiveAnnualIncome = (settings.annualIncome ?? 0) > 0 ? (settings.annualIncome ?? 0) : seedAnnualIncome;

  const _retMExp = JSON.parse(localStorage.getItem('seed_monthly_expense') || '{}');
  const _rKC = ['롯데카드', '하나복지', '고정비', '네이버', '기타'];
  const _rLC = ['우리카드', '네이버', '보험료', '생활비', '기타'];
  const _rSc = (obj, cats) => obj && typeof obj === 'object' ? cats.reduce((s, c) => s + (obj[c] || 0), 0) : 0;
  const _rM12 = Array.from({length:12},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(11-i));return d.toISOString().slice(0,7);});
  const _rFilled = _rM12.filter(ym=>{const v=_retMExp[ym];return v&&(_rSc(v.knk,_rKC)+_rSc(v.lch,_rLC))>0;});
  const manualAvgMonthlyExp = _rFilled.length > 0
    ? Math.round(_rFilled.reduce((s,ym)=>{const v=_retMExp[ym];return s+_rSc(v.knk,_rKC)+_rSc(v.lch,_rLC);},0)/_rFilled.length)
    : 0;

  // 은퇴 시뮬레이터 컨텍스트 저장 후 렌더
  _retCtx = { total, realEstateValue, settings, tossAssets, effectiveAnnualIncome };

  const initMonthlyExpMan = parseInt(localStorage.getItem('ad_ret_monthly_exp_man') || '500');
  const initRetEstEok = parseInt(localStorage.getItem('ad_ret_realestate_eok') || '20');
  const initRetAge = parseInt(localStorage.getItem('ad_ret_age') || String(settings.retirementAge ?? 55));
  const expInput = document.getElementById('ret-monthly-expense');
  const estInput = document.getElementById('ret-realestate-eok');
  const ageInput = document.getElementById('ret-age-input');
  if (expInput) expInput.value = initMonthlyExpMan;
  if (estInput) estInput.value = initRetEstEok;
  if (ageInput) ageInput.value = initRetAge;

  renderRetirementSection(initRetAge, initMonthlyExpMan * 10000, initRetEstEok);

  const _onRetInput = () => {
    const age = parseInt(ageInput?.value || '55');
    const exp = parseInt(expInput?.value || '500') * 10000;
    const est = parseInt(estInput?.value || '20');
    localStorage.setItem('ad_ret_age', age);
    localStorage.setItem('ad_ret_monthly_exp_man', exp / 10000);
    localStorage.setItem('ad_ret_realestate_eok', est);
    renderRetirementSection(age, exp, est);
  };
  expInput?.addEventListener('change', _onRetInput);
  estInput?.addEventListener('change', _onRetInput);
  ageInput?.addEventListener('change', _onRetInput);

  // 전월 대비
  const prev = sortedKeys.length >= 2 ? snaps[sortedKeys[sortedKeys.length - 2]] : null;
  const { amount, pct } = calcDailyChange(total, prev);
  const changeEl = document.getElementById('monthly-change');
  changeEl.textContent = prev
    ? `전월 대비 ${amount >= 0 ? '+' : ''}₩${amount.toLocaleString()} (${pct >= 0 ? '+' : ''}${pct}%)`
    : '';
  changeEl.className = `text-sm mt-2 ${amount >= 0 ? 'text-green-400' : 'text-red-400'}`;

  document.getElementById('last-updated').textContent = stocks.kr.updated_at
    ? `갱신: ${new Date(stocks.kr.updated_at).toLocaleString('ko-KR')}`
    : '데이터 없음';

  // 은퇴 궤적 차트
  const baseAsset = sortedKeys.length ? snaps[sortedKeys[sortedKeys.length - 1]] : total;
  const historical = sortedKeys.map(ym => ({ year: parseInt(ym.slice(0, 4)), value: snaps[ym] }));
  const makeProjection = (r) =>
    Array.from({ length: yearsToRetirementChart + 1 }, (_, i) => ({
      year: currentYear + i,
      value: calcRetirementAsset({
        currentFinancialAsset: baseAsset,
        currentRealEstate: tossAssets.realEstate ?? 0,
        annualIncome: settings.annualIncome ?? 0,
        savingsRate: settings.savingsRate ?? 0.55,
        financialReturn: r,
        realEstateReturn: settings.realEstateReturn ?? 0.03,
        yearsToRetirement: i,
        loanEvents: settings.loanEvents ?? [],
      }),
    }));
  renderRetirementProjectionChart('chart-retirement-projection', {
    historical,
    optimistic: makeProjection(settings.optimisticReturn ?? 0.08),
    pessimistic: makeProjection(settings.pessimisticReturn ?? 0.02),
    retirementYear: currentYear + yearsToRetirementChart,
    currentAge: settings.currentAge ?? 35,
    currentYear,
  });

  // 자산 현황
  const totalDebt = settings.totalDebt ?? 0;
  const equity = Math.max(0, total - totalDebt);
  document.getElementById('asset-overview').innerHTML = `
    <div class="grid grid-cols-3 gap-2 text-center">
      <div>
        <div class="text-xs text-gray-400 mb-1">총 자산</div>
        <div class="text-base font-bold text-white">₩${(total / 1e8).toFixed(1)}억</div>
      </div>
      <div>
        <div class="text-xs text-gray-400 mb-1">부채</div>
        <div class="text-base font-bold text-red-400">₩${(totalDebt / 1e8).toFixed(1)}억</div>
      </div>
      <div>
        <div class="text-xs text-gray-400 mb-1">순자산</div>
        <div class="text-base font-bold text-green-400">₩${(equity / 1e8).toFixed(1)}억</div>
      </div>
    </div>`;
  renderDebtEquityBar('chart-debt-equity', total, totalDebt);

  const coinTotal = crypto.totalValueKrw + upbitValue;
  renderAllocationDonut('chart-allocation-current', [
    { label: '한국 주식', valueKrw: stocks.kr.total_value_krw, color: '#3b82f6' },
    { label: '해외 주식', valueKrw: stocks.us.total_value_krw, color: '#8b5cf6' },
    { label: '코인',      valueKrw: coinTotal,                  color: '#f97316' },
    { label: '예금·현금', valueKrw: depositsTotal,              color: '#10b981' },
    { label: '부동산',    valueKrw: realEstateValue,            color: '#f43f5e' },
    { label: '금',        valueKrw: goldValue,                  color: '#fde047' },
  ]);

  // 주식 계좌 현황
  const krH = stocks.kr.holdings ?? [];
  const usH = stocks.us.holdings ?? [];
  const krVal = stocks.kr.total_value_krw ?? 0;
  const usVal = stocks.us.total_value_krw ?? 0;
  const accts = stocks.kr.accounts;
  const _fmtV = n => `₩${(n/1e8).toFixed(2)}억`;
  const _fmtW = n => `${n.toLocaleString()}원`;
  const _pnlClr = n => n >= 0 ? 'text-red-400' : 'text-blue-400';
  const _acctCard = (label, last4, a) => `
    <div class="bg-gray-800 rounded-xl p-3.5">
      <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-gray-700">
        <span class="text-xs font-semibold text-gray-200">📊 ${label}</span>
        <span class="text-[10px] text-gray-500">···${last4}</span>
      </div>
      <div class="space-y-1.5 text-xs">
        <div class="flex justify-between">
          <span class="text-gray-500">매입금액</span>
          <span class="text-gray-300">${_fmtW(a.buy_amount)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">평가금액</span>
          <span class="text-blue-400 font-semibold">${_fmtW(a.eval_amount)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">평가손익</span>
          <span class="${_pnlClr(a.pnl)} font-semibold">${a.pnl >= 0 ? '+' : ''}${_fmtW(a.pnl)} (${a.pnl >= 0 ? '+' : ''}${a.pnl_pct}%)</span>
        </div>
        ${a.yesu > 0 ? `<div class="flex justify-between border-t border-gray-700/40 pt-1.5">
          <span class="text-gray-500">예수금</span>
          <span class="text-gray-300">${_fmtW(a.yesu)}</span>
        </div>` : ''}
        <div class="flex items-center justify-between bg-gray-700/50 rounded-lg px-2.5 py-1.5 mt-1">
          <span class="text-gray-300 text-[11px] font-semibold">순자산</span>
          <span class="text-white font-bold">${_fmtV(a.eval_amount + (a.yesu ?? 0))}</span>
        </div>
      </div>
    </div>`;
  const updDate = stocks.kr.updated_at ? new Date(stocks.kr.updated_at).toLocaleDateString('ko-KR') : '';
  document.getElementById('holdings-list').innerHTML = (krVal > 0 || usVal > 0) ? `
    <div class="space-y-2">
      ${accts ? `
        ${_acctCard('ISA 중개형', accts.ISA.account_no_last4, accts.ISA)}
        ${_acctCard('CMA', accts.CMA.account_no_last4, accts.CMA)}
      ` : `
        <div class="bg-gray-800 rounded-xl p-4 text-center text-xs text-gray-500">주식 계좌 데이터 없음</div>
      `}
    </div>` : '';

  renderHomePriceCard(homeData);
  renderGoldCard(goldData);
  renderDepositsSection(depositsData);
  renderUpbitCard(upbitData);
}

function renderUpbitCard(data) {
  const el = document.getElementById('upbit-card');
  if (!el) return;
  const fmt = n => n >= 1e8 ? `₩${(n / 1e8).toFixed(2)}억` : `₩${Math.round(n / 10000).toLocaleString()}만`;

  if (!data || (data.holdings?.length === 0 && !data.error)) {
    const msg = data?.updatedAt
      ? '업비트 잔고 없음 (0원)'
      : '업비트 미연동 — GitHub Secrets에 UPBIT_ACCESS_KEY / UPBIT_SECRET_KEY 등록 후 워크플로를 실행하세요';
    el.innerHTML = `<div class="bg-gray-800 rounded-xl p-4 text-center text-xs text-gray-500">🪙 ${msg}</div>`;
    return;
  }

  if (data.error) {
    el.innerHTML = `<div class="bg-gray-800 rounded-xl p-4 text-center text-xs text-red-400">⚠️ 업비트 조회 오류: ${data.error}</div>`;
    return;
  }

  const pnlTotal = data.totalEvalKrw - data.totalPurchaseKrw;
  const pnlPct = data.totalPurchaseKrw > 0 ? Math.round(pnlTotal / data.totalPurchaseKrw * 10000) / 100 : 0;
  const pnlColor = pnlTotal >= 0 ? 'text-red-400' : 'text-blue-400';

  el.innerHTML = `
    <div class="bg-gray-800 rounded-xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-gray-300">🪙 업비트 코인 현황</h3>
        <span class="text-xs text-gray-500">실시간</span>
      </div>
      <div class="flex gap-3 mb-3 p-3 bg-gray-900 rounded-lg text-center">
        <div class="flex-1">
          <div class="text-[10px] text-gray-500 mb-0.5">총매수</div>
          <div class="text-sm font-bold text-gray-300">${fmt(data.totalPurchaseKrw)}</div>
        </div>
        <div class="flex-1 border-l border-gray-700">
          <div class="text-[10px] text-gray-500 mb-0.5">총평가</div>
          <div class="text-sm font-bold text-white">${fmt(data.totalEvalKrw)}</div>
        </div>
        <div class="flex-1 border-l border-gray-700">
          <div class="text-[10px] text-gray-500 mb-0.5">평가손익</div>
          <div class="text-sm font-bold ${pnlColor}">${pnlTotal >= 0 ? '+' : ''}${fmt(pnlTotal)} (${pnlPct >= 0 ? '+' : ''}${pnlPct}%)</div>
        </div>
      </div>
      <table class="w-full text-left">
        <thead><tr>
          <th class="text-[10px] text-gray-500 pb-1">코인</th>
          <th class="text-[10px] text-gray-500 pb-1 text-right">매수평균</th>
          <th class="text-[10px] text-gray-500 pb-1 text-right">현재가</th>
          <th class="text-[10px] text-gray-500 pb-1 text-right">평가금액</th>
          <th class="text-[10px] text-gray-500 pb-1 text-right">수익률</th>
        </tr></thead>
        <tbody>
          ${(data.holdings ?? []).map(h => {
            const c = h.pnlPct >= 0 ? 'text-red-400' : 'text-blue-400';
            return `<tr class="border-t border-gray-700/60">
              <td class="py-1.5 text-xs font-bold text-orange-400">${h.currency}</td>
              <td class="py-1.5 text-xs text-right text-gray-400">${h.avgBuyPrice.toLocaleString()}</td>
              <td class="py-1.5 text-xs text-right text-white">${h.currentPrice.toLocaleString()}</td>
              <td class="py-1.5 text-xs text-right font-bold text-white">${fmt(h.evalKrw)}</td>
              <td class="py-1.5 text-xs text-right font-bold ${c}">${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderGoldCard(data) {
  const el = document.getElementById('gold-card');
  if (!el) return;
  const fmt = n => `₩${(n / 1e8).toFixed(2)}억`;
  const fmtW = n => `₩${Math.round(n / 10000).toLocaleString()}만`;
  if (!data || data.totalValueKrw === 0) {
    el.innerHTML = `
      <div class="bg-gray-800 rounded-xl p-4 flex items-center gap-3">
        <span class="text-2xl">🥇</span>
        <div class="text-sm text-gray-500">금 시세 조회 중... (워크플로우 실행 후 표시)</div>
      </div>`;
    return;
  }
  el.innerHTML = `
    <div class="bg-gray-800 rounded-xl p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">🥇</span>
          <div>
            <div class="text-sm font-semibold text-gray-200">금 ${data.dons}돈 (${data.grams}g)</div>
            <div class="text-[10px] text-gray-500">
              $${data.priceUsdPerOz?.toLocaleString()}/oz · ₩${data.priceKrwPerGram?.toLocaleString()}/g · ₩${data.priceKrwPerDon?.toLocaleString()}/돈
            </div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-lg font-bold text-yellow-400">${fmt(data.totalValueKrw)}</div>
          <div class="text-[10px] text-gray-500">${data.updatedAt ? new Date(data.updatedAt).toLocaleDateString('ko-KR') : ''}</div>
        </div>
      </div>
    </div>`;
}

function renderHomePriceCard(data) {
  const el = document.getElementById('home-price-card');
  if (!el) return;
  if (!data || data.estimatedValue === 0) {
    el.innerHTML = `
      <div class="bg-gray-800 rounded-xl p-4 flex items-center gap-3">
        <span class="text-2xl">🏠</span>
        <div>
          <div class="text-xs text-gray-400">서대문센트럴아이파크 104동 601호</div>
          <div class="text-sm text-gray-500 mt-0.5">시세 조회 중… (매주 월요일 자동 업데이트)</div>
        </div>
      </div>`;
    return;
  }
  const fmt = n => `₩${(n / 1e8).toFixed(2)}억`;
  const t = data.recentTrade;
  el.innerHTML = `
    <div class="bg-gray-800 rounded-xl p-4">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="text-xl">🏠</span>
          <div>
            <div class="text-sm font-semibold text-gray-200">${data.aptName} 104동 601호</div>
            <div class="text-[10px] text-gray-500">${data.note}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-lg font-bold text-rose-400">${fmt(data.estimatedValue)}</div>
          <div class="text-[10px] text-gray-500">${data.updatedAt ? new Date(data.updatedAt).toLocaleDateString('ko-KR') : ''}</div>
        </div>
      </div>
      ${data.allTrades?.length > 1 ? `
      <div class="mt-2 border-t border-gray-700 pt-2">
        <div class="text-[10px] text-gray-500 mb-1">단지 최근 실거래 (참고)</div>
        <div class="space-y-0.5">
          ${data.allTrades.slice(0, 3).map(t => `
            <div class="flex justify-between text-[11px] text-gray-400">
              <span>${t.dong}동 ${t.floor}층 ${t.area}㎡</span>
              <span class="font-medium text-gray-300">${fmt(t.amount)} <span class="text-gray-600">${t.date}</span></span>
            </div>`).join('')}
        </div>
      </div>` : ''}
    </div>`;
}

function renderDepositsSection(data) {
  const el = document.getElementById('deposits-section');
  if (!el) return;
  if (!data || !data.items || data.items.length === 0) {
    el.innerHTML = `
      <div class="bg-gray-800 rounded-xl p-4 text-center text-xs text-gray-500">
        예금·적금 데이터 없음 — 구글 시트에 입력 후 워크플로우 실행
      </div>`;
    return;
  }

  // 주식 계좌는 포트폴리오 탭에서 표시 (이중계상 방지 — 예금·적금 목록에서 제외)
  const STOCK_TYPES_IN_DEP = new Set(['국내해외주식(CMA)', '국내주식(ISA)', '주식예수금']);
  data = { ...data, items: data.items.filter(i => !STOCK_TYPES_IN_DEP.has(i.type)) };

  const EXCL_LS_KEY = 'ad_deposits_excluded';
  const getExcluded = () => new Set(JSON.parse(localStorage.getItem(EXCL_LS_KEY) || '[]'));
  const saveExcluded = (s) => localStorage.setItem(EXCL_LS_KEY, JSON.stringify([...s]));
  const iKey = (item) => `${item.owner}|${item.type}|${item.institution}|${item.amount}`;

  const today = new Date().toISOString().slice(0, 10);
  const fmt = n => n >= 1e8 ? `₩${(n / 1e8).toFixed(1)}억` : `₩${Math.round(n / 1e4).toLocaleString()}만`;
  const typeColor = { '예금': '#3b82f6', '적금': '#10b981', '자유적금': '#6366f1', '입출금': '#9ca3af', '외화통장': '#f59e0b', '코인': '#f97316', '비트코인': '#f97316' };
  const ownerColor = { '김노경': 'text-blue-400', '이창헌': 'text-purple-400' };

  const GROUP_ORDER = ['김노경', '이창헌', '공동자산'];
  const byOwner = {};
  for (const item of data.items) {
    const ownerKey = (item.owner === '김노경' || item.owner === '이창헌') ? item.owner : '공동자산';
    (byOwner[ownerKey] = byOwner[ownerKey] || []).push(item);
  }
  const groups = GROUP_ORDER.filter(g => byOwner[g]);

  function calcTotals(excluded) {
    let total = 0, knk = 0, lch = 0;
    for (const item of data.items) {
      if (!excluded.has(iKey(item))) {
        total += item.amount;
        if (item.owner === '김노경') knk += item.amount;
        else if (item.owner === '이창헌') lch += item.amount;
      }
    }
    return { total, knk, lch };
  }

  function refreshTotals() {
    const excl = getExcluded();
    const { total, knk, lch } = calcTotals(excl);
    el.querySelector('#dep-total').textContent = fmt(total);
    el.querySelector('#dep-knk').textContent = fmt(knk);
    el.querySelector('#dep-lch').textContent = fmt(lch);
    for (const owner of groups) {
      const ownerItems = byOwner[owner] || [];
      const sub = ownerItems.reduce((s, i) => excl.has(iKey(i)) ? s : s + i.amount, 0);
      const subEl = el.querySelector(`.dep-sub[data-owner="${owner}"]`);
      if (subEl) subEl.textContent = fmt(sub);
    }
  }

  const ownerBlock = (owner, items) => {
    const excl = getExcluded();
    const color = ownerColor[owner] || 'text-yellow-400';
    const subtotal = items.reduce((s, i) => excl.has(iKey(i)) ? s : s + i.amount, 0);
    const rows = items.map(item => {
      const key = iKey(item);
      const checked = !excl.has(key);
      const daysLeft = item.maturityDate
        ? Math.ceil((new Date(item.maturityDate) - new Date(today)) / 86400000) : null;
      const urgentBadge = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30
        ? `<span class="ml-1 text-[10px] bg-red-900 text-red-300 rounded px-1 font-bold">D-${daysLeft}</span>` : '';
      const typeCol = typeColor[item.type] || '#d1d5db';
      const rateLabel = item.rate != null ? `연 ${item.rate}%` : '-';
      const safeKey = key.replace(/"/g, '&quot;');
      return `<tr class="border-t border-gray-700/60 transition-opacity ${checked ? '' : 'opacity-40'}">
        <td class="py-1.5 pr-2 text-center w-6">
          <input type="checkbox" class="dep-chk w-3.5 h-3.5 cursor-pointer accent-blue-500"
            data-ikey="${safeKey}" ${checked ? 'checked' : ''}>
        </td>
        <td class="py-1.5 pr-3 text-xs text-gray-200 font-medium">${item.institution || '-'}</td>
        <td class="py-1.5 pr-3">
          <span class="text-[10px] rounded px-1.5 py-0.5 font-semibold whitespace-nowrap"
            style="background:${typeCol}22;color:${typeCol}">${item.type}</span>
        </td>
        <td class="py-1.5 pr-3 text-xs text-right font-bold text-white">${fmt(item.amount)}</td>
        <td class="py-1.5 pr-3 text-xs text-center text-green-400 whitespace-nowrap">${rateLabel}</td>
        <td class="py-1.5 text-xs text-gray-400 whitespace-nowrap">${item.maturityDate || '-'}${urgentBadge}</td>
      </tr>`;
    }).join('');

    return `
      <div class="mb-1">
        <div class="flex items-center justify-between py-2 border-b border-gray-700">
          <span class="text-sm font-bold ${color}">${owner}</span>
          <span class="text-sm font-bold text-white dep-sub" data-owner="${owner}">${fmt(subtotal)}</span>
        </div>
        <table class="w-full text-left">
          <thead><tr>
            <th class="w-6"></th>
            <th class="text-[10px] text-gray-500 pt-2 pb-1 pr-3">기관명</th>
            <th class="text-[10px] text-gray-500 pt-2 pb-1 pr-3">종류</th>
            <th class="text-[10px] text-gray-500 pt-2 pb-1 pr-3 text-right">금액</th>
            <th class="text-[10px] text-gray-500 pt-2 pb-1 pr-3 text-center">금리</th>
            <th class="text-[10px] text-gray-500 pt-2 pb-1">만기일</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  };

  const initExcl = getExcluded();
  const { total, knk, lch } = calcTotals(initExcl);
  const updatedLabel = data.updatedAt
    ? `기준: ${new Date(data.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    : '';

  el.innerHTML = `
    <div class="bg-gray-800 rounded-xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-gray-300">💰 예금·적금·현금 현황</h3>
        <span class="text-xs text-gray-500">${updatedLabel}</span>
      </div>
      <div class="flex gap-3 mb-2 p-3 bg-gray-900 rounded-lg text-center">
        <div class="flex-1">
          <div class="text-[10px] text-gray-500 mb-0.5">합계 (✓항목)</div>
          <div class="text-base font-bold text-white" id="dep-total">${fmt(total)}</div>
        </div>
        <div class="flex-1 border-l border-gray-700">
          <div class="text-[10px] text-gray-500 mb-0.5">김노경</div>
          <div class="text-sm font-bold text-blue-400" id="dep-knk">${fmt(knk)}</div>
        </div>
        <div class="flex-1 border-l border-gray-700">
          <div class="text-[10px] text-gray-500 mb-0.5">이창헌</div>
          <div class="text-sm font-bold text-purple-400" id="dep-lch">${fmt(lch)}</div>
        </div>
      </div>
      <p class="text-[10px] text-gray-500 mb-3">☑ 체크 해제 시 합계에서 제외 (IRP·연금보험 등 은퇴 후 자금 제외용)</p>
      <div class="overflow-x-auto">
        ${groups.map(g => ownerBlock(g, byOwner[g])).join('<div class="h-2"></div>')}
      </div>
    </div>`;

  el.querySelectorAll('.dep-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const excl = getExcluded();
      const key = chk.dataset.ikey;
      if (chk.checked) excl.delete(key); else excl.add(key);
      saveExcluded(excl);
      chk.closest('tr').classList.toggle('opacity-40', !chk.checked);
      refreshTotals();
    });
  });
}

// ─── TAB 2: 씨앗모으기 ─────────────────────────────────────────────────────────

function renderSpendTab(ctx) {
  const { allSpendingRecords, settings } = ctx;
  const today = new Date().toISOString().slice(0, 10);
  const currentYM = today.slice(0, 7);
  const monthName = `${new Date().getMonth() + 1}월`;
  const sum = arr => arr.reduce((t, r) => t + r.amount, 0);
  const csvMonthAmt = sum(filterSpendingByDate(allSpendingRecords, 'month', today));

  // 월별 지출 수동 기록 { "YYYY-MM": { knk: { cat: won, ... }, lch: { cat: won, ... } } }
  const manualExpenses = JSON.parse(localStorage.getItem('seed_monthly_expense') || '{}');
  const _sumCats = (obj, cats) => obj && typeof obj === 'object' ? cats.reduce((s, c) => s + (obj[c] || 0), 0) : (typeof obj === 'number' ? obj : 0);
  const getKnkExp = ym => { const v = manualExpenses[ym]; if (!v) return 0; if (typeof v === 'number') return v; return _sumCats(v.knk, KNK_CATS); };
  const getLchExp = ym => { const v = manualExpenses[ym]; if (!v) return 0; if (typeof v === 'number') return 0; return _sumCats(v.lch, LCH_CATS); };
  const getMonthTotal = ym => getKnkExp(ym) + getLchExp(ym);
  const getCatVal = (ym, owner, cat) => { const v = manualExpenses[ym]; if (!v || typeof v === 'number') return 0; const sub = v[owner]; return sub && typeof sub === 'object' ? (sub[cat] || 0) : 0; };
  const _dailyAll = JSON.parse(localStorage.getItem('daily_expenses') || '{}');
  const _dailyCurrentTotal = (_dailyAll[currentYM] || []).reduce((s, e) => s + (e.amount || 0), 0);
  const effectiveMonthAmt = _dailyCurrentTotal > 0 ? _dailyCurrentTotal : (csvMonthAmt > 0 ? csvMonthAmt : getMonthTotal(currentYM));

  // 2026년 1~12월 고정
  const months12 = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'];

  // 소득 상세 데이터
  const incomeDetail = JSON.parse(localStorage.getItem('seed_income_detail') || 'null') ?? {
    knk: { salary: 0, incentive: 0 },
    lch: { salary: 0, incentive: 0 },
    proj: { salaryGrowthPct: 3, incentiveRatePct: 10 },
    salaryHistory: [],
  };
  // 구 데이터 마이그레이션: salaryHistory가 없고 salary 값이 있으면 초기 이력 생성
  if (!incomeDetail.salaryHistory) {
    const initKnk = incomeDetail.knk?.salary || 0;
    const initLch = incomeDetail.lch?.salary || 0;
    incomeDetail.salaryHistory = (initKnk > 0 || initLch > 0)
      ? [{ from: '2026-01', knk: initKnk, lch: initLch }]
      : [];
  }
  // 월별 급여 조회 (이력 기반 — 해당 월 이전 가장 최근 이력 적용)
  const getSalaryForMonth = ym => {
    const hist = incomeDetail.salaryHistory;
    if (!hist || hist.length === 0) {
      return { knk: (incomeDetail.knk?.salary || 0) * 10000, lch: (incomeDetail.lch?.salary || 0) * 10000 };
    }
    const sorted = [...hist].sort((a, b) => b.from.localeCompare(a.from));
    const entry = sorted.find(e => e.from <= ym) || sorted[sorted.length - 1];
    return { knk: (entry.knk || 0) * 10000, lch: (entry.lch || 0) * 10000 };
  };
  const currentSalary = getSalaryForMonth(currentYM);
  const knkMonthly = currentSalary.knk;
  const lchMonthly = currentSalary.lch;
  const detailedTotal = knkMonthly + lchMonthly;
  const legacyIncome = parseInt(localStorage.getItem('seed_monthly_income') || '0');
  const defaultIncome = Math.round((settings.annualIncome ?? 0) / 12);
  const monthlyIncome = detailedTotal > 0 ? detailedTotal : (legacyIncome || defaultIncome);

  // 월별 기타소득 (인센·퇴직금) — manualExpenses[ym].income.{knk,lch}
  const getMonthExtra = ym => (manualExpenses[ym]?.income?.knk || 0) + (manualExpenses[ym]?.income?.lch || 0);
  const getMonthTotalIncome = ym => {
    const sal = getSalaryForMonth(ym);
    const knkF = manualExpenses[ym]?.income?.knkFixed !== undefined
      ? manualExpenses[ym].income.knkFixed * 10000 : sal.knk;
    const lchF = manualExpenses[ym]?.income?.lchFixed !== undefined
      ? manualExpenses[ym].income.lchFixed * 10000 : sal.lch;
    const base = (knkF + lchF) > 0 ? (knkF + lchF) : (legacyIncome || defaultIncome);
    return base + getMonthExtra(ym);
  };

  const currentExtra = getMonthExtra(currentYM);
  const seed = (monthlyIncome + currentExtra) - effectiveMonthAmt;
  const seedPct = (monthlyIncome + currentExtra) > 0 ? Math.round(seed / (monthlyIncome + currentExtra) * 100) : 0;
  const hasManualData = months12.some(ym => getMonthTotal(ym) > 0);

  // 1년 후 전망 (월 실수령 인상 기반)
  const growthPct = incomeDetail.proj?.salaryGrowthPct ?? 3;
  const currentAnnualSalary = ((incomeDetail.knk.salary || 0) + (incomeDetail.lch.salary || 0)) * 12 * 10000;
  const projAnnualSalary = currentAnnualSalary * (1 + growthPct / 100);
  const projMonthly = detailedTotal > 0 ? Math.round(projAnnualSalary / 12) : 0;
  const filledMonths = months12.filter(ym => getMonthTotal(ym) > 0);
  const avgExpense12 = hasManualData
    ? Math.round(filledMonths.reduce((s, ym) => s + getMonthTotal(ym), 0) / filledMonths.length)
    : effectiveMonthAmt;
  const projSeed12 = projMonthly > 0 ? Math.round((projMonthly - avgExpense12) * 12) : 0;

  // 12개월 누적 씨앗 (월별 소득 + 기타소득 반영)
  const seed12Total = months12.reduce((s, ym) => {
    const exp = getMonthTotal(ym);
    return exp > 0 ? s + (getMonthTotalIncome(ym) - exp) : s;
  }, 0);
  const seed12Months = filledMonths.length;

  // 씨앗 히어로
  document.getElementById('seed-hero').innerHTML = `
    <div class="bg-gray-800 rounded-2xl p-5">
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div class="text-xs text-gray-400 mb-1">🌱 ${monthName} 씨앗</div>
          <div class="text-2xl font-bold ${seed >= 0 ? 'text-green-400' : 'text-red-400'}">
            ${effectiveMonthAmt > 0 ? (seed >= 0 ? '+' : '') + '₩' + Math.round(seed/10000).toLocaleString() + '만' : '<span class="text-sm text-gray-500">지출 미입력</span>'}
          </div>
          ${effectiveMonthAmt > 0 ? `<div class="text-xs text-gray-500 mt-0.5">저축률 ${seedPct}%</div>` : ''}
        </div>
        <div>
          <div class="text-xs text-gray-400 mb-1">📊 최근 ${seed12Months}개월 누적</div>
          <div class="text-2xl font-bold ${seed12Total >= 0 ? 'text-green-400' : 'text-red-400'}">
            ${seed12Months > 0 ? (seed12Total >= 0 ? '+' : '') + '₩' + Math.round(seed12Total/10000).toLocaleString() + '만' : '<span class="text-sm text-gray-500">데이터 없음</span>'}
          </div>
          ${seed12Months > 0 ? `<div class="text-xs text-gray-500 mt-0.5">월평균 ₩${Math.round(seed12Total/seed12Months/10000).toLocaleString()}만</div>` : ''}
        </div>
      </div>
      ${effectiveMonthAmt > 0 ? `
      <div class="bg-gray-700 rounded-full h-2 mb-3">
        <div class="h-2 rounded-full ${seed >= 0 ? 'bg-green-500' : 'bg-red-500'}"
          style="width:${Math.min(100, Math.max(0, seedPct))}%"></div>
      </div>` : ''}
      <div class="flex items-center justify-between gap-1 text-center">
        <div class="flex-1 min-w-0">
          <div class="text-[10px] text-gray-500 mb-0.5">월 소득</div>
          <div class="text-sm font-bold text-white">₩${Math.round(monthlyIncome/10000).toLocaleString()}만</div>
          ${detailedTotal > 0 ? `<div class="text-[10px] text-gray-500">김${Math.round(knkMonthly/10000)}+이${Math.round(lchMonthly/10000)}</div>` : ''}
        </div>
        <div class="text-base font-bold text-gray-400 flex-shrink-0">+</div>
        <div class="flex-1 min-w-0">
          <div class="text-[10px] text-gray-500 mb-0.5">기타소득</div>
          <div class="text-sm font-bold text-blue-300">${currentExtra > 0 ? '₩' + Math.round(currentExtra/10000).toLocaleString() + '만' : '—'}</div>
          ${currentExtra > 0 ? `<div class="text-[10px] text-gray-500">인센·상여 등</div>` : '<div class="text-[10px] text-gray-600">해당없음</div>'}
        </div>
        <div class="text-base font-bold text-gray-400 flex-shrink-0">−</div>
        <div class="flex-1 min-w-0">
          <div class="text-[10px] text-gray-500 mb-0.5">이번달 지출</div>
          <div class="text-sm font-bold text-orange-400">${effectiveMonthAmt > 0 ? '₩' + Math.round(effectiveMonthAmt/10000).toLocaleString() + '만' : '—'}</div>
        </div>
        <div class="text-base font-bold text-gray-400 flex-shrink-0">=</div>
        <div class="flex-1 min-w-0">
          <div class="text-[10px] text-gray-500 mb-0.5">씨앗</div>
          <div class="text-sm font-bold ${seed >= 0 ? 'text-green-400' : 'text-red-400'}">${effectiveMonthAmt > 0 ? '₩' + Math.round(seed/10000).toLocaleString() + '만' : '—'}</div>
        </div>
      </div>
    </div>`;

  // 월별 소득 테이블 rows (고정 + 기타소득 통합)
  const incomeTableRows = months12.map(ym => {
    const label = ym.slice(2).replace('-', '.');
    const isCurrent = ym === currentYM;
    const salDefault = getSalaryForMonth(ym);
    const knkFixedVal = manualExpenses[ym]?.income?.knkFixed;
    const lchFixedVal = manualExpenses[ym]?.income?.lchFixed;
    const knkFixed = knkFixedVal !== undefined ? knkFixedVal : Math.round(salDefault.knk / 10000);
    const lchFixed = lchFixedVal !== undefined ? lchFixedVal : Math.round(salDefault.lch / 10000);
    const knkExtra = Math.round((manualExpenses[ym]?.income?.knk || 0) / 10000);
    const lchExtra = Math.round((manualExpenses[ym]?.income?.lch || 0) / 10000);
    const knkTotal = knkFixed + knkExtra;
    const lchTotal = lchFixed + lchExtra;
    return `<tr class="${isCurrent ? 'bg-green-950/20' : ''} border-t border-gray-700/30">
      <td class="py-1 pr-2 text-xs ${isCurrent ? 'text-blue-300 font-semibold' : 'text-gray-400'} whitespace-nowrap">${label}</td>
      <td class="py-0.5 pr-1">
        <input type="number" class="income-fixed-inp bg-gray-700/60 rounded px-1.5 py-0.5 text-white w-[4.2rem] text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
          data-ym="${ym}" data-owner="knk" value="${knkFixed || ''}" placeholder="${Math.round(salDefault.knk / 10000)}" />
      </td>
      <td class="py-0.5 pr-1">
        <input type="number" class="income-extra-inp bg-gray-700/60 rounded px-1.5 py-0.5 text-blue-100/70 w-[3.5rem] text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400/50"
          data-ym="${ym}" data-owner="knk" value="${knkExtra || ''}" placeholder="0" />
      </td>
      <td class="py-0.5 pr-4 text-right text-[11px] font-semibold ${knkTotal > 0 ? 'text-blue-300' : 'text-gray-600'} whitespace-nowrap">${knkTotal > 0 ? knkTotal.toLocaleString() : '—'}</td>
      <td class="py-0.5 pr-1">
        <input type="number" class="income-fixed-inp bg-gray-700/60 rounded px-1.5 py-0.5 text-white w-[4.2rem] text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-500"
          data-ym="${ym}" data-owner="lch" value="${lchFixed || ''}" placeholder="${Math.round(salDefault.lch / 10000)}" />
      </td>
      <td class="py-0.5 pr-1">
        <input type="number" class="income-extra-inp bg-gray-700/60 rounded px-1.5 py-0.5 text-purple-100/70 w-[3.5rem] text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-400/50"
          data-ym="${ym}" data-owner="lch" value="${lchExtra || ''}" placeholder="0" />
      </td>
      <td class="py-0.5 text-right text-[11px] font-semibold ${lchTotal > 0 ? 'text-purple-300' : 'text-gray-600'} whitespace-nowrap">${lchTotal > 0 ? lchTotal.toLocaleString() : '—'}</td>
    </tr>`;
  }).join('');

  // 월별 지출 테이블 rows (flat — 전체 월 한눈에)
  const mkCatInp = (ym, owner, cat, ring) => {
    const v = getCatVal(ym, owner, cat);
    return `<td class="p-0.5">
      <input type="text" inputmode="numeric" data-ym="${ym}" data-owner="${owner}" data-cat="${cat}"
        value="${v > 0 ? v.toLocaleString() : ''}" placeholder=""
        class="expense-cat-inp bg-gray-700/60 rounded px-1 py-1 text-white w-[4.5rem] text-right text-[11px] focus:outline-none focus:ring-1 ${ring} focus:bg-gray-700" />
    </td>`;
  };

  const expenseTableRows = months12.map(ym => {
    const isCurrent = ym === currentYM;
    const label = ym.slice(2).replace('-', '.');
    const knkT = getKnkExp(ym);
    const lchT = getLchExp(ym);
    return `<tr class="${isCurrent ? 'bg-blue-950/20' : ''} border-t border-gray-700/30">
      <td class="sticky left-0 ${isCurrent ? 'bg-blue-950/60' : 'bg-gray-800'} z-10 py-1 pr-2 text-xs font-medium ${isCurrent ? 'text-blue-300' : 'text-gray-400'} whitespace-nowrap">${label}</td>
      ${KNK_CATS.map(cat => mkCatInp(ym, 'knk', cat, 'focus:ring-blue-500/60')).join('')}
      <td class="px-0.5 py-1 text-xs text-center text-blue-300 font-semibold whitespace-nowrap border-l border-blue-800/40">${knkT > 0 ? `₩${knkT.toLocaleString()}` : '—'}</td>
      <td class="px-1"></td>
      ${LCH_CATS.map(cat => mkCatInp(ym, 'lch', cat, 'focus:ring-purple-500/60')).join('')}
      <td class="px-0.5 py-1 text-xs text-center text-purple-300 font-semibold whitespace-nowrap border-l border-purple-800/40">${lchT > 0 ? `₩${lchT.toLocaleString()}` : '—'}</td>
      <td class="px-1 py-1 text-xs text-center text-green-300 font-bold whitespace-nowrap border-l border-green-800/40">${(knkT + lchT) > 0 ? `₩${(knkT + lchT).toLocaleString()}` : '—'}</td>
    </tr>`;
  }).join('');

  // 급여 이력 UI 데이터
  const _latestSalEntry = incomeDetail.salaryHistory.length > 0
    ? [...incomeDetail.salaryHistory].sort((a, b) => b.from.localeCompare(a.from))[0]
    : { from: currentYM, knk: incomeDetail.knk?.salary || 0, lch: incomeDetail.lch?.salary || 0 };
  const _salHistoryRows = [...incomeDetail.salaryHistory]
    .sort((a, b) => b.from.localeCompare(a.from))
    .map(e => `<tr class="border-t border-gray-700/30">
      <td class="py-0.5 pr-3 text-[11px] text-gray-400">${e.from}</td>
      <td class="py-0.5 pr-3 text-[11px] text-blue-300 text-right">₩${e.knk}만</td>
      <td class="py-0.5 pr-3 text-[11px] text-purple-300 text-right">₩${e.lch}만</td>
      <td class="py-0.5 text-[11px] text-gray-300 text-right font-medium">₩${(e.knk + e.lch).toLocaleString()}만</td>
    </tr>`).join('');

  document.getElementById('seed-input-section').innerHTML = `
    <div class="bg-gray-800 rounded-xl p-4 space-y-3">
      <h3 class="text-sm font-semibold text-gray-300">💰 월별 소득 입력</h3>
      <div class="overflow-x-auto -mx-4 px-4">
        <table class="text-xs min-w-max">
          <thead>
            <tr>
              <th class="text-left text-gray-500 font-normal pb-0.5 pr-2" rowspan="2">월</th>
              <th colspan="3" class="text-blue-400 text-center pb-0.5 border-b border-blue-800/40 pr-4">👤 김노경</th>
              <th colspan="3" class="text-purple-400 text-center pb-0.5 border-b border-purple-800/40">👤 이창헌</th>
            </tr>
            <tr>
              <th class="text-gray-500 font-normal py-1 pr-1 text-right text-[10px]">고정(만)</th>
              <th class="text-gray-500 font-normal py-1 pr-1 text-right text-[10px]">기타(만)</th>
              <th class="text-blue-400/70 font-normal py-1 pr-4 text-right text-[10px]">합계</th>
              <th class="text-gray-500 font-normal py-1 pr-1 text-right text-[10px]">고정(만)</th>
              <th class="text-gray-500 font-normal py-1 pr-1 text-right text-[10px]">기타(만)</th>
              <th class="text-purple-400/70 font-normal py-1 text-right text-[10px]">합계</th>
            </tr>
          </thead>
          <tbody>${incomeTableRows}</tbody>
        </table>
      </div>
      <details class="border-t border-gray-700/50 pt-2">
        <summary class="text-[11px] text-gray-500 cursor-pointer hover:text-gray-300 select-none">▸ 고정소득 기본값 설정 (급여 이력)</summary>
        <div class="mt-2 pl-1 space-y-2">
          <p class="text-[10px] text-gray-600">테이블에서 고정소득을 직접 입력하면 해당 월만 개별 적용됩니다. 공란이면 아래 급여 이력 기본값이 사용됩니다.</p>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="text-[10px] text-blue-400 mb-1">김노경 (만원)</div>
              <input id="inp-knk-salary" type="number" value="${_latestSalEntry.knk}"
                class="bg-gray-700 rounded px-2 py-1 text-white w-full text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <div class="text-[10px] text-purple-400 mb-1">이창헌 (만원)</div>
              <input id="inp-lch-salary" type="number" value="${_latestSalEntry.lch}"
                class="bg-gray-700 rounded px-2 py-1 text-white w-full text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-500" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-gray-500 shrink-0">적용 시작 월</span>
            <input id="inp-salary-from" type="month" value="${currentYM}"
              class="bg-gray-700 rounded px-2 py-1 text-white text-[11px] focus:outline-none focus:ring-1 focus:ring-green-500" />
          </div>
          ${incomeDetail.salaryHistory.length > 0 ? `
          <table class="w-full">
            <thead>
              <tr>
                <th class="text-left text-[10px] text-gray-600 font-normal pb-0.5 pr-3">시작월</th>
                <th class="text-[10px] text-blue-400/60 font-normal pb-0.5 pr-3 text-right">김노경</th>
                <th class="text-[10px] text-purple-400/60 font-normal pb-0.5 pr-3 text-right">이창헌</th>
                <th class="text-[10px] text-gray-500 font-normal pb-0.5 text-right">합계</th>
              </tr>
            </thead>
            <tbody>${_salHistoryRows}</tbody>
          </table>` : ''}
        </div>
      </details>
      <div class="flex items-center justify-between pt-2 border-t border-gray-700">
        <span class="text-xs text-gray-400">당월 합계: <span class="text-white font-bold">₩${Math.round((monthlyIncome + currentExtra)/10000).toLocaleString()}만</span></span>
        <button id="btn-save-income" class="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg text-xs text-white transition-colors">저장</button>
      </div>
    </div>

    <div class="bg-gray-800 rounded-xl p-4 mt-3">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-gray-300">📅 월별 지출 기록</h3>
        <button id="btn-save-expense" class="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 rounded-lg text-xs text-white transition-colors">저장</button>
      </div>
      <p class="text-[10px] text-gray-500 mb-3">원 단위 입력 · 저장 후 씨앗 자동 계산</p>
      <div class="overflow-x-auto -mx-4 px-4">
        <table class="text-xs min-w-max">
          <thead>
            <tr>
              <th class="sticky left-0 bg-gray-800 z-10 text-left text-gray-400 pr-3 align-bottom pb-1" rowspan="2">월</th>
              <th colspan="${KNK_CATS.length + 1}" class="text-blue-400 text-center pb-0.5 border-b border-blue-800/40">김노경</th>
              <th></th>
              <th colspan="${LCH_CATS.length + 1}" class="text-purple-400 text-center pb-0.5 border-b border-purple-800/40">이창헌</th>
              <th class="text-green-400 text-center pb-0.5 border-b border-green-800/40 pl-1">TOTAL</th>
            </tr>
            <tr>
              ${KNK_CATS.map(c => `<th class="text-gray-500 font-normal text-center py-1 px-0.5 text-[10px] whitespace-nowrap">${c}</th>`).join('')}
              <th class="text-blue-400/70 font-normal text-center py-1 px-0.5 text-[10px] whitespace-nowrap border-l border-blue-800/40">합계(원)</th>
              <th class="px-1"></th>
              ${LCH_CATS.map(c => `<th class="text-gray-500 font-normal text-center py-1 px-0.5 text-[10px] whitespace-nowrap">${c}</th>`).join('')}
              <th class="text-purple-400/70 font-normal text-center py-1 px-0.5 text-[10px] whitespace-nowrap border-l border-purple-800/40">합계(원)</th>
              <th class="text-green-400/70 font-normal text-center py-1 px-0.5 text-[10px] whitespace-nowrap border-l border-green-800/40 pl-1">합계(원)</th>
            </tr>
          </thead>
          <tbody>${expenseTableRows}</tbody>
        </table>
      </div>
    </div>
    <div id="daily-expense-section" class="mt-3"></div>

    ${detailedTotal > 0 ? `
    <div class="bg-gray-800 rounded-xl p-4 space-y-3 mt-3">
      <h3 class="text-sm font-semibold text-gray-300">🔮 1년 후 씨앗 전망</h3>
      <div>
        <div class="text-xs text-gray-400 mb-1">월 실수령 인상 가정 (%)</div>
        <input id="inp-salary-growth" type="number" step="0.5" min="0" max="30" value="${growthPct}"
          class="bg-gray-700 rounded px-2 py-1.5 text-white w-full text-right text-xs focus:outline-none focus:ring-1 focus:ring-green-500" />
      </div>
      <div class="bg-gray-700 rounded-lg p-3 space-y-1.5">
        <div class="flex justify-between text-xs">
          <span class="text-gray-400">월 평균 지출 (실적 기반)</span>
          <span class="text-white font-medium">₩${Math.round(avgExpense12/10000).toLocaleString()}만</span>
        </div>
        <div class="flex justify-between text-xs">
          <span class="text-gray-400">1년 후 월 실수령</span>
          <span class="text-blue-400 font-bold">₩${Math.round(projMonthly/10000).toLocaleString()}만</span>
        </div>
        <div class="flex justify-between text-xs border-t border-gray-600 pt-1.5">
          <span class="text-green-400 font-semibold">12개월 예상 씨앗 합계</span>
          <span class="font-bold text-lg ${projSeed12 >= 0 ? 'text-green-400' : 'text-red-400'}">${projSeed12 >= 0 ? '+' : ''}₩${Math.round(Math.abs(projSeed12)/10000).toLocaleString()}만</span>
        </div>
      </div>
      <button id="btn-save-proj" class="w-full px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300 transition-colors">가정값 저장</button>
    </div>` : `
    <div class="bg-gray-800 rounded-xl p-3 mt-3 text-xs text-gray-500 text-center">소득을 입력하면 1년 후 전망이 표시됩니다</div>`}`;

  document.getElementById('btn-save-income').addEventListener('click', () => {
    const knkSalary = parseInt(document.getElementById('inp-knk-salary')?.value || '0');
    const lchSalary = parseInt(document.getElementById('inp-lch-salary')?.value || '0');
    const fromMonth = document.getElementById('inp-salary-from')?.value || currentYM;
    // 급여 이력 업데이트: 같은 from 월이면 덮어쓰기, 아니면 추가
    const history = [...(incomeDetail.salaryHistory || [])];
    const existingIdx = history.findIndex(e => e.from === fromMonth);
    if (existingIdx >= 0) {
      history[existingIdx] = { from: fromMonth, knk: knkSalary, lch: lchSalary };
    } else {
      history.push({ from: fromMonth, knk: knkSalary, lch: lchSalary });
    }
    // 최신 이력 기준으로 knk/lch 동기화 (하위 호환)
    const latestEntry = [...history].sort((a, b) => b.from.localeCompare(a.from))[0];
    const newDetail = {
      knk: { salary: latestEntry.knk },
      lch: { salary: latestEntry.lch },
      proj: incomeDetail.proj,
      salaryHistory: history,
    };
    localStorage.setItem('seed_income_detail', JSON.stringify(newDetail));
    localStorage.setItem('seed_monthly_income', String((latestEntry.knk + latestEntry.lch) * 10000));
    saveToFirestore();
    // 월별 소득 저장 (고정소득 오버라이드 + 기타소득)
    const updInc = { ...manualExpenses };
    const ensureInc = ym => {
      if (!updInc[ym]) updInc[ym] = {};
      if (!updInc[ym].income) updInc[ym].income = {};
      if (typeof updInc[ym].knk !== 'object') updInc[ym].knk = {};
      if (typeof updInc[ym].lch !== 'object') updInc[ym].lch = {};
    };
    // 고정소득 월별 오버라이드 (income-fixed-inp)
    document.querySelectorAll('.income-fixed-inp').forEach(inp => {
      const { ym, owner } = inp.dataset;
      ensureInc(ym);
      const salDef = getSalaryForMonth(ym);
      const defVal = Math.round((owner === 'knk' ? salDef.knk : salDef.lch) / 10000);
      const val = inp.value.trim() !== '' ? parseInt(inp.value) : null;
      const key = owner + 'Fixed';
      if (val !== null && val !== defVal) updInc[ym].income[key] = val;
      else delete updInc[ym].income[key];
    });
    // 기타소득 (income-extra-inp)
    document.querySelectorAll('.income-extra-inp').forEach(inp => {
      const { ym, owner } = inp.dataset;
      ensureInc(ym);
      const val = parseInt(inp.value || '0') * 10000;
      if (val > 0) updInc[ym].income[owner] = val; else delete updInc[ym].income[owner];
    });
    for (const ym of Object.keys(updInc)) {
      const knkSum = _sumCats(updInc[ym]?.knk, KNK_CATS);
      const lchSum = _sumCats(updInc[ym]?.lch, LCH_CATS);
      const extra = (updInc[ym]?.income?.knk || 0) + (updInc[ym]?.income?.lch || 0);
      const hasFixed = updInc[ym]?.income?.knkFixed !== undefined || updInc[ym]?.income?.lchFixed !== undefined;
      if (knkSum === 0 && lchSum === 0 && extra === 0 && !hasFixed) delete updInc[ym];
    }
    localStorage.setItem('seed_monthly_expense', JSON.stringify(updInc));
    saveToFirestore();
    renderSpendTab(ctx);
  });

  // 월별 지출 입력칸 쉼표 포맷 (focus: 쉼표 제거 / blur: 쉼표 추가)
  document.querySelectorAll('.expense-cat-inp').forEach(inp => {
    inp.addEventListener('focus', () => { inp.value = inp.value.replace(/,/g, ''); });
    inp.addEventListener('blur', () => {
      const n = parseInt(inp.value.replace(/,/g, '') || '0');
      inp.value = n > 0 ? n.toLocaleString() : '';
    });
  });

  document.getElementById('btn-save-expense').addEventListener('click', () => {
    const updated = { ...manualExpenses };
    const ensureYm = ym => {
      if (!updated[ym]) updated[ym] = {};
      if (typeof updated[ym].knk !== 'object') updated[ym].knk = {};
      if (typeof updated[ym].lch !== 'object') updated[ym].lch = {};
      if (!updated[ym].income) updated[ym].income = {};
    };
    document.querySelectorAll('.expense-cat-inp').forEach(inp => {
      const { ym, owner, cat } = inp.dataset;
      ensureYm(ym);
      const val = parseInt((inp.value || '0').replace(/,/g, ''));
      if (val > 0) updated[ym][owner][cat] = val; else delete updated[ym][owner][cat];
    });
    for (const ym of Object.keys(updated)) {
      const knkSum = _sumCats(updated[ym]?.knk, KNK_CATS);
      const lchSum = _sumCats(updated[ym]?.lch, LCH_CATS);
      const extra = (updated[ym]?.income?.knk || 0) + (updated[ym]?.income?.lch || 0);
      if (knkSum === 0 && lchSum === 0 && extra === 0) delete updated[ym];
    }
    localStorage.setItem('seed_monthly_expense', JSON.stringify(updated));
    saveToFirestore();
    renderSpendTab(ctx);
  });

  document.getElementById('btn-save-proj')?.addEventListener('click', () => {
    const g = parseFloat(document.getElementById('inp-salary-growth')?.value || '3');
    const saved = JSON.parse(localStorage.getItem('seed_income_detail') || '{}');
    saved.proj = { ...(saved.proj || {}), salaryGrowthPct: g };
    localStorage.setItem('seed_income_detail', JSON.stringify(saved));
    saveToFirestore();
    renderSpendTab(ctx);
  });

  // 연간 추이 차트 섹션 렌더링
  const chartMonths = months12.filter(ym => getMonthTotal(ym) > 0);
  const trendLabels = chartMonths.map(ym => ym.slice(2).replace('-', '.'));
  const trendIncome = chartMonths.map(ym => Math.round(getMonthTotalIncome(ym) / 10000));
  const trendExpense = chartMonths.map(ym => Math.round(getMonthTotal(ym) / 10000));
  const trendSeed = chartMonths.map(ym => Math.round((getMonthTotalIncome(ym) - getMonthTotal(ym)) / 10000));

  const trendEl = document.getElementById('seed-trend-section');
  if (trendEl) {
    trendEl.innerHTML = `
      <div class="bg-gray-800 rounded-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-300">📈 연간 추이</h3>
          <div class="flex gap-1">
            <button id="trend-btn-income" class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${_trendMode==='income'?'bg-blue-600 text-white':'bg-gray-700 text-gray-400 hover:bg-gray-600'}">소득</button>
            <button id="trend-btn-expense" class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${_trendMode==='expense'?'bg-orange-600 text-white':'bg-gray-700 text-gray-400 hover:bg-gray-600'}">지출</button>
            <button id="trend-btn-seed" class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${_trendMode==='seed'?'bg-green-600 text-white':'bg-gray-700 text-gray-400 hover:bg-gray-600'}">씨앗</button>
          </div>
        </div>
        ${chartMonths.length === 0
          ? `<p class="text-xs text-gray-500 text-center py-8">월별 지출을 입력하면 추이 차트가 표시됩니다</p>`
          : `<canvas id="chart-seed-bars" height="160"></canvas>`}
      </div>`;

    if (chartMonths.length > 0) {
      _buildTrendChart(trendLabels, trendIncome, trendExpense, trendSeed);
    }

    ['income', 'expense', 'seed'].forEach(mode => {
      document.getElementById(`trend-btn-${mode}`)?.addEventListener('click', () => {
        _trendMode = mode;
        ['income', 'expense', 'seed'].forEach(m => {
          const btn = document.getElementById(`trend-btn-${m}`);
          if (!btn) return;
          const colors = { income: 'bg-blue-600', expense: 'bg-orange-600', seed: 'bg-green-600' };
          btn.className = `px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
            m === mode ? colors[m] + ' text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`;
        });
        _buildTrendChart(trendLabels, trendIncome, trendExpense, trendSeed);
      });
    });
  }
  if (!_dailySelectedYM) _dailySelectedYM = currentYM;
  renderDailySection(_dailySelectedYM, ctx);
}

function renderDailyCharts(entries, CAT_COLORS) {
  const catAgg = {}, payerAgg = {};
  for (const e of entries) {
    const cat = e.category || '기타';
    const payer = e.payer || '김노경';
    catAgg[cat] = (catAgg[cat] || 0) + (e.amount || 0);
    payerAgg[payer] = (payerAgg[payer] || 0) + (e.amount || 0);
  }

  if (_dailyChartCat) { _dailyChartCat.destroy(); _dailyChartCat = null; }
  const catCanvas = document.getElementById('chart-daily-cat');
  if (catCanvas && Object.keys(catAgg).length) {
    const catTotal = Object.values(catAgg).reduce((s, v) => s + v, 0);
    const sorted = Object.entries(catAgg).sort((a, b) => b[1] - a[1]);
    const catLabels = sorted.map(([k]) => k);
    const catData   = sorted.map(([, v]) => v);
    _dailyChartCat = new Chart(catCanvas, {
      type: 'bar',
      data: {
        labels: catLabels.map((k, i) => [k, `${Math.round(catData[i] / catTotal * 100)}%`]),
        datasets: [{
          data: catData,
          backgroundColor: catLabels.map(k => CAT_COLORS[k] || '#9ca3af'),
          borderRadius: 4,
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: 'end', align: 'top',
            color: '#e5e7eb',
            font: { size: 9, weight: 'bold' },
            formatter: v => `${Math.round(v / 10000)}만`,
          }
        },
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 9 }, maxRotation: 0 }, grid: { display: false } },
          y: { display: false, grid: { display: false } }
        },
        layout: { padding: { top: 18 } }
      },
      plugins: [ChartDataLabels]
    });
  }

  if (_dailyChartPayer) { _dailyChartPayer.destroy(); _dailyChartPayer = null; }
  const payerCanvas = document.getElementById('chart-daily-payer');
  if (payerCanvas && Object.keys(payerAgg).length) {
    const payerTotal = Object.values(payerAgg).reduce((s, v) => s + v, 0);
    const payerSorted = Object.entries(payerAgg).sort((a, b) => b[1] - a[1]);
    const payerLabels = payerSorted.map(([k]) => k);
    const payerData   = payerSorted.map(([, v]) => v);
    _dailyChartPayer = new Chart(payerCanvas, {
      type: 'bar',
      data: {
        labels: payerLabels.map((k, i) => [k, `${Math.round(payerData[i] / payerTotal * 100)}%`]),
        datasets: [{
          data: payerData,
          backgroundColor: ['#3b82f6', '#a855f7', '#10b981'],
          borderRadius: 4,
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: 'end', align: 'top',
            color: '#e5e7eb',
            font: { size: 9, weight: 'bold' },
            formatter: v => `${Math.round(v / 10000)}만`,
          }
        },
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { display: false } },
          y: { display: false, grid: { display: false } }
        },
        layout: { padding: { top: 18 } }
      },
      plugins: [ChartDataLabels]
    });
  }
}

function syncDailyToMonthly(ym) {
  const all = JSON.parse(localStorage.getItem('daily_expenses') || '{}');
  const entries = all[ym] || [];
  const knkAgg = {}, lchAgg = {};
  for (const e of entries) {
    const payer = e.payer || '김노경';
    const method = e.payMethod || '';
    const amt = e.amount || 0;
    if (payer === '김노경') {
      const key = KNK_CATS.includes(method) ? method : '기타';
      knkAgg[key] = (knkAgg[key] || 0) + amt;
    } else {
      const key = LCH_CATS.includes(method) ? method : '기타';
      lchAgg[key] = (lchAgg[key] || 0) + amt;
    }
  }
  const monthly = JSON.parse(localStorage.getItem('seed_monthly_expense') || '{}');
  if (!monthly[ym]) monthly[ym] = {};
  if (typeof monthly[ym].knk !== 'object') monthly[ym].knk = {};
  if (typeof monthly[ym].lch !== 'object') monthly[ym].lch = {};
  for (const cat of KNK_CATS) {
    if (knkAgg[cat] !== undefined) monthly[ym].knk[cat] = knkAgg[cat];
    else if (entries.length > 0) delete monthly[ym].knk[cat];
  }
  for (const cat of LCH_CATS) {
    if (lchAgg[cat] !== undefined) monthly[ym].lch[cat] = lchAgg[cat];
    else if (entries.length > 0) delete monthly[ym].lch[cat];
  }
  const knkSum = Object.values(monthly[ym]?.knk || {}).reduce((s, v) => s + v, 0);
  const lchSum = Object.values(monthly[ym]?.lch || {}).reduce((s, v) => s + v, 0);
  const extra = (monthly[ym]?.income?.knk || 0) + (monthly[ym]?.income?.lch || 0);
  if (knkSum === 0 && lchSum === 0 && extra === 0) delete monthly[ym];
  localStorage.setItem('seed_monthly_expense', JSON.stringify(monthly));
}

function renderDailySection(currentYM, _ctx) {
  const el = document.getElementById('daily-expense-section');
  if (!el) return;

  const DAILY_CATS = ['쇼핑', '식재료', '생활용품', '외식', '간식', '선물', '구독료', '공과금', '보험료', '교통비', '통신비', '의료비', '기타', '김당고'];
  const PAY_METHODS = ['롯데카드', '하나복지', '고정비', '네이버', '현금', '계좌이체', '기타', '우리카드'];
  const PAYERS = ['김노경', '이창헌'];
  const DAILY_KEY = 'daily_expenses';
  const monthLabel = `${parseInt(currentYM.slice(5))}월`;
  const CAT_COLORS = { '쇼핑': '#ec4899', '식재료': '#10b981', '생활용품': '#3b82f6', '외식': '#f97316', '간식': '#f59e0b', '선물': '#8b5cf6', '구독료': '#7c3aed', '공과금': '#06b6d4', '보험료': '#6366f1', '교통비': '#14b8a6', '통신비': '#0284c7', '의료비': '#0ea5e9', '기타': '#9ca3af', '김당고': '#ef4444' };

  const getAllData = () => JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');
  const getEntries = () => [...(getAllData()[currentYM] || [])].sort((a, b) => a.date - b.date);
  const saveEntries = (entries) => {
    const all = getAllData();
    all[currentYM] = entries;
    localStorage.setItem(DAILY_KEY, JSON.stringify(all));
    syncDailyToMonthly(currentYM);
    saveToFirestore();
  };

  const entries = getEntries();
  const total = entries.reduce((s, e) => s + (e.amount || 0), 0);

  const inpCls = 'bg-gray-600 rounded px-1 py-0.5 text-white text-[11px] focus:outline-none focus:ring-1 focus:ring-yellow-400';
  const selOpt = (list, cur) => list.map(v => `<option value="${v}"${v === cur ? ' selected' : ''}>${v}</option>`).join('');

  const rowsHtml = entries.length ? entries.map((e, idx) => {
    const col = CAT_COLORS[e.category] || '#9ca3af';
    if (idx === _dailyEditIdx) {
      return `<tr class="border-b border-yellow-600/40 bg-yellow-950/20">
        <td class="py-1 pr-1"><input type="number" class="edit-date ${inpCls} w-10 text-center" min="1" max="31" value="${e.date}" data-idx="${idx}" /></td>
        <td class="py-1 pr-1"><input type="text" inputmode="numeric" class="edit-amount ${inpCls} w-24 text-right" value="${(e.amount||0).toLocaleString()}" data-idx="${idx}" /></td>
        <td class="py-1 pr-1"><select class="edit-cat ${inpCls}"  data-idx="${idx}">${selOpt(DAILY_CATS, e.category)}</select></td>
        <td class="py-1 pr-1"><select class="edit-method ${inpCls}" data-idx="${idx}">${selOpt(PAY_METHODS, e.payMethod)}</select></td>
        <td class="py-1 pr-1"><select class="edit-payer ${inpCls}" data-idx="${idx}">${selOpt(PAYERS, e.payer)}</select></td>
        <td class="py-1 pr-1"><input type="text" class="edit-desc ${inpCls} w-28" value="${e.desc || ''}" data-idx="${idx}" /></td>
        <td class="py-1 text-center whitespace-nowrap">
          <button class="daily-save text-yellow-400 hover:text-yellow-300 text-xs font-bold px-1" data-idx="${idx}">✓</button>
          <button class="daily-cancel text-gray-400 hover:text-gray-300 text-xs font-bold px-1" data-idx="${idx}">✕</button>
        </td>
      </tr>`;
    }
    return `<tr class="border-b border-gray-700/50">
      <td class="py-1.5 pr-2 text-xs text-gray-300 text-center whitespace-nowrap">${String(e.date).padStart(2, '0')}일</td>
      <td class="py-1.5 pr-2 text-xs text-right font-bold text-white whitespace-nowrap">₩${(e.amount || 0).toLocaleString()}</td>
      <td class="py-1.5 pr-2 text-xs"><span class="rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap" style="background:${col}22;color:${col}">${e.category || '-'}</span></td>
      <td class="py-1.5 pr-2 text-xs text-gray-400 whitespace-nowrap">${e.payMethod || ''}</td>
      <td class="py-1.5 pr-2 text-xs text-gray-400 whitespace-nowrap">${e.payer || ''}</td>
      <td class="py-1.5 pr-2 text-xs text-gray-300">${e.desc || ''}</td>
      <td class="py-1.5 text-center whitespace-nowrap">
        <button class="daily-edit text-yellow-500 hover:text-yellow-300 text-xs px-1" data-idx="${idx}" title="수정">✏️</button>
        <button class="daily-del text-red-400 hover:text-red-300 text-base font-bold leading-none px-1" data-idx="${idx}">×</button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" class="py-4 text-center text-xs text-gray-500">기록 없음 — 아래에서 추가하세요</td></tr>`;

  el.innerHTML = `
    <div class="bg-gray-800 rounded-xl p-4">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-0.5">
          <button id="btn-daily-prev-month" class="text-gray-400 hover:text-white text-xl leading-none px-1.5 py-0.5 rounded hover:bg-gray-700 transition-colors">‹</button>
          <h3 class="text-sm font-semibold text-gray-300">📅 일별 지출기록 — ${monthLabel}</h3>
          <button id="btn-daily-next-month" class="text-gray-400 hover:text-white text-xl leading-none px-1.5 py-0.5 rounded hover:bg-gray-700 transition-colors">›</button>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm font-bold text-orange-400">₩${total.toLocaleString()}</span>
          <button id="btn-daily-save-chart" class="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-xs text-white whitespace-nowrap transition-colors">저장</button>
        </div>
      </div>
      <div class="overflow-x-auto -mx-1">
        <table class="w-full text-left min-w-[520px]">
          <thead>
            <tr class="border-b border-gray-700">
              <th class="text-[10px] text-gray-500 pb-1.5 pr-2 text-center">일자</th>
              <th class="text-[10px] text-gray-500 pb-1.5 pr-2 text-right">금액</th>
              <th class="text-[10px] text-gray-500 pb-1.5 pr-2">분류</th>
              <th class="text-[10px] text-gray-500 pb-1.5 pr-2">결제수단</th>
              <th class="text-[10px] text-gray-500 pb-1.5 pr-2">결제자</th>
              <th class="text-[10px] text-gray-500 pb-1.5 pr-2">상세 사용처</th>
              <th class="text-[10px] text-gray-500 pb-1.5"></th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="mt-3 pt-3 border-t border-gray-700">
        <div class="flex gap-1.5 flex-wrap items-center">
          <div class="flex items-center gap-1">
            <input type="number" id="daily-inp-date" min="1" max="31" placeholder="일"
              class="bg-gray-700 rounded px-2 py-1.5 text-white text-xs w-12 text-center focus:outline-none focus:ring-1 focus:ring-orange-500" />
            <span class="text-xs text-gray-500">일</span>
          </div>
          <input type="text" id="daily-inp-amount" placeholder="금액(원)" inputmode="numeric"
            class="bg-gray-700 rounded px-2 py-1.5 text-white text-xs w-28 text-right focus:outline-none focus:ring-1 focus:ring-orange-500" />
          <select id="daily-inp-cat"
            class="bg-gray-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-orange-500">
            ${DAILY_CATS.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <select id="daily-inp-method"
            class="bg-gray-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-orange-500">
            ${PAY_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
          <select id="daily-inp-payer"
            class="bg-gray-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-orange-500">
            ${PAYERS.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
          <input type="text" id="daily-inp-desc" placeholder="상세 사용처"
            class="bg-gray-700 rounded px-2 py-1.5 text-white text-xs flex-1 min-w-[5rem] focus:outline-none focus:ring-1 focus:ring-orange-500" />
          <button id="btn-daily-add"
            class="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 rounded-lg text-xs text-white whitespace-nowrap transition-colors">
            + 추가
          </button>
        </div>
      </div>
      ${_dailyChartsVisible && entries.length > 0 ? `
      <div class="mt-4 pt-4 border-t border-gray-700">
        <div class="text-xs text-gray-400 font-semibold mb-3">📊 ${monthLabel} 지출 분석</div>
        <div>
          <div class="text-[10px] text-gray-500 mb-2">카테고리별 지출분석</div>
          <canvas id="chart-daily-cat" height="140"></canvas>
        </div>
        <div class="mt-4">
          <div class="text-[10px] text-gray-500 mb-2">결제자별 지출금액</div>
          <canvas id="chart-daily-payer" height="100"></canvas>
        </div>
      </div>` : ''}
    </div>`;

  // 차트 렌더링 (저장 후)
  if (_dailyChartsVisible && entries.length > 0) renderDailyCharts(entries, CAT_COLORS);

  // 월 이동 버튼
  document.getElementById('btn-daily-prev-month')?.addEventListener('click', () => {
    const [y, m] = currentYM.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    _dailySelectedYM = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    _dailyEditIdx = -1;
    renderDailySection(_dailySelectedYM, _ctx);
  });
  document.getElementById('btn-daily-next-month')?.addEventListener('click', () => {
    const [y, m] = currentYM.split('-').map(Number);
    const d = new Date(y, m, 1);
    _dailySelectedYM = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    _dailyEditIdx = -1;
    renderDailySection(_dailySelectedYM, _ctx);
  });

  // 저장 버튼 → 차트 표시
  document.getElementById('btn-daily-save-chart')?.addEventListener('click', () => {
    _dailyChartsVisible = true;
    if (_ctx) renderSpendTab(_ctx); else renderDailySection(currentYM, _ctx);
  });

  // 금액 입력 쉼표 포맷
  const amtInp = document.getElementById('daily-inp-amount');
  if (amtInp) {
    amtInp.addEventListener('input', () => {
      const raw = amtInp.value.replace(/[^0-9]/g, '');
      const n = parseInt(raw || '0');
      amtInp.value = n > 0 ? n.toLocaleString() : raw;
    });
  }

  el.querySelectorAll('.daily-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      _dailyEditIdx = parseInt(btn.dataset.idx);
      renderDailySection(currentYM, _ctx);
    });
  });

  el.querySelectorAll('.daily-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      _dailyEditIdx = -1;
      renderDailySection(currentYM, _ctx);
    });
  });

  el.querySelectorAll('.daily-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const row = btn.closest('tr');
      const dateVal = parseInt(row.querySelector('.edit-date')?.value || '0');
      const rawAmt = (row.querySelector('.edit-amount')?.value || '').replace(/,/g, '');
      const amtVal = parseInt(rawAmt || '0');
      const catVal = row.querySelector('.edit-cat')?.value || '';
      const methodVal = row.querySelector('.edit-method')?.value || '';
      const payerVal = row.querySelector('.edit-payer')?.value || '';
      const descVal = (row.querySelector('.edit-desc')?.value || '').trim();
      if (!dateVal || dateVal < 1 || dateVal > 31 || amtVal <= 0) return;
      const updated = getEntries();
      updated[idx] = { date: dateVal, amount: amtVal, category: catVal, payMethod: methodVal, payer: payerVal, desc: descVal };
      _dailyEditIdx = -1;
      saveEntries(updated);
      renderDailySection(currentYM, _ctx);
    });
  });

  // edit-amount 쉼표 포맷 (편집 행)
  el.querySelectorAll('.edit-amount').forEach(inp => {
    inp.addEventListener('input', () => {
      const raw = inp.value.replace(/[^0-9]/g, '');
      const n = parseInt(raw || '0');
      inp.value = n > 0 ? n.toLocaleString() : raw;
    });
  });

  el.querySelectorAll('.daily-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (_dailyEditIdx === idx) _dailyEditIdx = -1;
      saveEntries(getEntries().filter((_, i) => i !== idx));
      renderDailySection(currentYM, _ctx);
    });
  });

  document.getElementById('btn-daily-add')?.addEventListener('click', () => {
    const dateVal = parseInt(document.getElementById('daily-inp-date')?.value || '0');
    const rawAmt = (document.getElementById('daily-inp-amount')?.value || '').replace(/,/g, '');
    const amtVal = parseInt(rawAmt || '0');
    const catVal = document.getElementById('daily-inp-cat')?.value || '';
    const methodVal = document.getElementById('daily-inp-method')?.value || '';
    const payerVal = document.getElementById('daily-inp-payer')?.value || '';
    const descVal = (document.getElementById('daily-inp-desc')?.value || '').trim();
    if (!dateVal || dateVal < 1 || dateVal > 31 || amtVal <= 0) return;
    const updated = getEntries();
    updated.push({ date: dateVal, amount: amtVal, category: catVal, payMethod: methodVal, payer: payerVal, desc: descVal });
    saveEntries(updated);
    renderDailySection(currentYM, _ctx);
  });
}

function _buildTrendChart(labels, incomeData, expenseData, seedData) {
  if (_seedBarsChart) { _seedBarsChart.destroy(); _seedBarsChart = null; }
  const canvas = document.getElementById('chart-seed-bars');
  if (!canvas) return;

  const modeConfig = {
    income:  { data: incomeData,  color: '#3b82f6', label: '월 소득 (만원)' },
    expense: { data: expenseData, color: '#f97316', label: '월 지출 (만원)' },
    seed:    {
      data: seedData,
      color: seedData.map(v => v >= 0 ? '#10b981' : '#ef4444'),
      label: '월 씨앗 (만원)',
    },
  };
  const cfg = modeConfig[_trendMode];

  _seedBarsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: cfg.label,
        data: cfg.data,
        backgroundColor: Array.isArray(cfg.color) ? cfg.color.map(c => c + '99') : cfg.color + '99',
        borderColor: cfg.color,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        datalabels: {
          color: '#fff',
          font: { size: 9 },
          formatter: v => v !== 0 ? `${v}만` : '',
          anchor: 'end', align: 'start',
        },
      },
      scales: {
        y: {
          ticks: { color: '#9ca3af', callback: v => `${v}만` },
          grid: { color: '#374151' },
        },
        x: { ticks: { color: '#e5e7eb', font: { size: 10 } }, grid: { display: false } },
      },
    },
    plugins: [ChartDataLabels],
  });
}

// ─── 공통 헬퍼 ────────────────────────────────────────────────────────────────

function cacheStocksForPortfolio(stocks) {
  try {
    localStorage.setItem('_pf_stocks_kr', JSON.stringify(stocks.kr));
    localStorage.setItem('_pf_stocks_us', JSON.stringify(stocks.us));
  } catch (_) {}
}

function autoSnapshot(totalAsset, stocks, crypto, depositsTotal) {
  const ym = new Date().toISOString().slice(0, 7);
  storage.setSnapshot(ym, totalAsset);
  storage.setCategorySnapshot(ym, {
    stocksKr: stocks.kr.total_value_krw,
    stocksUs: stocks.us.total_value_krw,
    crypto: crypto.totalValueKrw,
    deposits: depositsTotal,
  });
}

async function boot() {
  await main();
}

boot().catch(console.error);
