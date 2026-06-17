import { parseTossAssetCsv, parseTossSpendingCsv } from './csv-parser.js';
import { calcRetirementAsset, calcRetirementSurvivalYears, calcQuitNowSurvivalYears } from './calculations.js';

export function renderSettings(storage) {
  const s = storage.getSettings();
  renderPortfolioManagement(storage);
  renderRetirementForm(storage, s);
  renderQuitSimulator(storage);
  renderLocationForm(storage);
  renderUpbitSettings();
  renderCsvUpload(storage);
}

// ── 포트폴리오 관리 (주식·자산 입력) ───────────────────────────────────────────
function renderPortfolioManagement(storage) {
  const el = document.getElementById('portfolio-management');
  if (!el) return;

  const krList = storage.getPortfolioKr();
  const usList = storage.getPortfolioUs();
  const manual = storage.getManualAssets();

  const krRows = krList.map((h, i) => `
    <tr class="border-t border-gray-700/50">
      <td class="py-1.5 pr-2 text-xs text-gray-200">${h.name || h.ticker}</td>
      <td class="py-1.5 pr-2 text-xs text-gray-400">${h.ticker}</td>
      <td class="py-1.5 pr-2 text-xs text-right text-gray-200">${h.shares.toLocaleString()}</td>
      <td class="py-1.5 pr-2 text-xs text-right text-gray-400">${h.avg_price_krw ? h.avg_price_krw.toLocaleString() : '-'}</td>
      <td class="py-1.5 text-xs text-gray-400">${h.account || ''}</td>
      <td class="py-1.5 pl-2">
        <button data-del-kr="${i}" class="text-red-400 hover:text-red-300 text-xs">삭제</button>
      </td>
    </tr>`).join('');

  const usRows = usList.map((h, i) => `
    <tr class="border-t border-gray-700/50">
      <td class="py-1.5 pr-2 text-xs text-gray-200">${h.name || h.ticker}</td>
      <td class="py-1.5 pr-2 text-xs text-gray-400">${h.ticker}</td>
      <td class="py-1.5 pr-2 text-xs text-right text-gray-200">${h.shares.toLocaleString()}</td>
      <td class="py-1.5 pr-2 text-xs text-right text-gray-400">${h.avg_price_krw ? h.avg_price_krw.toLocaleString() : '-'}</td>
      <td class="py-1.5 pl-2">
        <button data-del-us="${i}" class="text-red-400 hover:text-red-300 text-xs">삭제</button>
      </td>
    </tr>`).join('');

  el.innerHTML = `
    <div class="space-y-5">

      <!-- 국내주식 -->
      <div class="bg-gray-800 rounded-xl p-4">
        <h3 class="text-sm font-semibold text-gray-300 mb-3">국내주식 (KR)</h3>
        <p class="text-xs text-gray-500 mb-3">종목코드: 삼성전자 → 005930, SK하이닉스 → 000660, KODEX S&P500 → 379800</p>
        ${krList.length > 0 ? `
        <table class="w-full mb-3">
          <thead><tr class="text-[10px] text-gray-500">
            <th class="text-left pb-1">종목명</th><th class="text-left pb-1">코드</th>
            <th class="text-right pb-1">수량</th><th class="text-right pb-1">평단(원)</th>
            <th class="text-left pb-1">계좌</th><th></th>
          </tr></thead>
          <tbody>${krRows}</tbody>
        </table>` : '<p class="text-xs text-gray-600 mb-3">등록된 종목이 없습니다</p>'}
        <div class="grid grid-cols-[1fr_80px_80px_80px_72px_auto] gap-1.5 items-center">
          <input id="kr-name" placeholder="종목명" class="bg-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500" />
          <input id="kr-ticker" placeholder="코드" class="bg-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500" />
          <input id="kr-shares" type="number" placeholder="수량" class="bg-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500 text-right" />
          <input id="kr-avg" type="number" placeholder="평단" class="bg-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500 text-right" />
          <input id="kr-account" placeholder="ISA/CMA" class="bg-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500" />
          <button id="btn-add-kr" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors whitespace-nowrap">추가</button>
        </div>
      </div>

      <!-- 해외주식 -->
      <div class="bg-gray-800 rounded-xl p-4">
        <h3 class="text-sm font-semibold text-gray-300 mb-3">해외주식 (US)</h3>
        <p class="text-xs text-gray-500 mb-3">티커: 테슬라 → TSLA, 애플 → AAPL, 엔비디아 → NVDA, S&P500 ETF → SPY</p>
        ${usList.length > 0 ? `
        <table class="w-full mb-3">
          <thead><tr class="text-[10px] text-gray-500">
            <th class="text-left pb-1">종목명</th><th class="text-left pb-1">티커</th>
            <th class="text-right pb-1">수량</th><th class="text-right pb-1">평단(원환산)</th><th></th>
          </tr></thead>
          <tbody>${usRows}</tbody>
        </table>` : '<p class="text-xs text-gray-600 mb-3">등록된 종목이 없습니다</p>'}
        <div class="grid grid-cols-[1fr_80px_80px_100px_auto] gap-1.5 items-center">
          <input id="us-name" placeholder="종목명" class="bg-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500" />
          <input id="us-ticker" placeholder="TSLA" class="bg-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500" />
          <input id="us-shares" type="number" placeholder="수량" class="bg-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500 text-right" />
          <input id="us-avg-krw" type="number" placeholder="평단(원환산)" class="bg-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500 text-right" />
          <button id="btn-add-us" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors whitespace-nowrap">추가</button>
        </div>
      </div>

      <!-- 기타 자산 수동 입력 -->
      <div class="bg-gray-800 rounded-xl p-4">
        <h3 class="text-sm font-semibold text-gray-300 mb-3">기타 자산</h3>
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <label class="text-xs text-gray-400 w-28 flex-shrink-0">예금·적금 합계</label>
            <input id="manual-deposits" type="number" value="${manual.deposits || ''}" placeholder="0"
              class="flex-1 bg-gray-700 rounded px-3 py-1.5 text-xs text-white text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <span class="text-xs text-gray-500 flex-shrink-0">원</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-xs text-gray-400 w-28 flex-shrink-0">아파트/부동산</label>
            <input id="manual-apartment" type="number" value="${manual.apartment || ''}" placeholder="0"
              class="flex-1 bg-gray-700 rounded px-3 py-1.5 text-xs text-white text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <span class="text-xs text-gray-500 flex-shrink-0">원</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-xs text-gray-400 w-28 flex-shrink-0">금 보유량</label>
            <input id="manual-gold" type="number" value="${manual.goldDons || ''}" placeholder="0"
              class="flex-1 bg-gray-700 rounded px-3 py-1.5 text-xs text-white text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <span class="text-xs text-gray-500 flex-shrink-0">돈 (1돈=3.75g)</span>
          </div>
        </div>
        <button id="btn-save-manual" class="mt-4 w-full bg-green-700 hover:bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          저장 및 대시보드 새로고침
        </button>
      </div>

    </div>`;

  // 이벤트: KR 종목 추가
  document.getElementById('btn-add-kr')?.addEventListener('click', () => {
    const name = document.getElementById('kr-name').value.trim();
    const ticker = document.getElementById('kr-ticker').value.trim().replace('.KS', '');
    const shares = parseInt(document.getElementById('kr-shares').value) || 0;
    const avg = parseInt(document.getElementById('kr-avg').value) || 0;
    const account = document.getElementById('kr-account').value.trim();
    if (!ticker || !shares) return;
    const list = storage.getPortfolioKr();
    list.push({ ticker, name: name || ticker, shares, avg_price_krw: avg, account });
    storage.setPortfolioKr(list);
    renderPortfolioManagement(storage);
    window.dispatchEvent(new CustomEvent('portfolio-changed'));
  });

  // 이벤트: US 종목 추가
  document.getElementById('btn-add-us')?.addEventListener('click', () => {
    const name = document.getElementById('us-name').value.trim();
    const ticker = document.getElementById('us-ticker').value.trim().toUpperCase();
    const shares = parseInt(document.getElementById('us-shares').value) || 0;
    const avg = parseInt(document.getElementById('us-avg-krw').value) || 0;
    if (!ticker || !shares) return;
    const list = storage.getPortfolioUs();
    list.push({ ticker, name: name || ticker, shares, avg_price_krw: avg });
    storage.setPortfolioUs(list);
    renderPortfolioManagement(storage);
    window.dispatchEvent(new CustomEvent('portfolio-changed'));
  });

  // 이벤트: KR 종목 삭제
  el.querySelectorAll('[data-del-kr]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.delKr);
      const list = storage.getPortfolioKr();
      list.splice(i, 1);
      storage.setPortfolioKr(list);
      renderPortfolioManagement(storage);
    });
  });

  // 이벤트: US 종목 삭제
  el.querySelectorAll('[data-del-us]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.delUs);
      const list = storage.getPortfolioUs();
      list.splice(i, 1);
      storage.setPortfolioUs(list);
      renderPortfolioManagement(storage);
    });
  });

  // 이벤트: 기타 자산 저장
  document.getElementById('btn-save-manual')?.addEventListener('click', () => {
    const manual = storage.getManualAssets();
    manual.deposits = parseInt(document.getElementById('manual-deposits').value) || 0;
    manual.apartment = parseInt(document.getElementById('manual-apartment').value) || 0;
    manual.goldDons = parseFloat(document.getElementById('manual-gold').value) || 0;
    storage.setManualAssets(manual);
    window.location.reload();
  });
}

function renderRetirementForm(storage, s) {
  document.getElementById('settings-form').innerHTML = `
    <div class="space-y-4">
      <div class="bg-gray-800 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-gray-300 mb-4">기본 정보</h3>
        <div class="grid grid-cols-2 gap-3">
          ${field('inp-age', '현재 나이', s.currentAge ?? 35, 'number')}
          ${field('inp-retirement-age', '목표 은퇴 나이', s.retirementAge ?? 55, 'number')}
          ${incomeField('inp-income', s.annualIncome ?? 0)}
          ${field('inp-savings-rate', '저축률 (%)', Math.round((s.savingsRate ?? 0.55) * 100), 'number')}
        </div>
      </div>
      <div class="bg-gray-800 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-gray-300 mb-4">수익률 가정</h3>
        <div class="grid grid-cols-3 gap-3">
          ${field('inp-optimistic', '희망 수익률 (%)', Math.round((s.optimisticReturn ?? 0.08) * 100), 'number')}
          ${field('inp-pessimistic', '절망 수익률 (%)', Math.round((s.pessimisticReturn ?? 0.02) * 100), 'number')}
          ${field('inp-realestate-return', '부동산 상승률 (%)', Math.round((s.realEstateReturn ?? 0.03) * 100), 'number')}
        </div>
      </div>
      <div class="bg-gray-800 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-gray-300 mb-1">대출 이벤트</h3>
        <p class="text-xs text-gray-500 mb-3">은퇴 궤적 계산 시 차감할 대출 상환 일정을 입력하세요.</p>
        <div class="grid grid-cols-[1fr_80px_110px_80px_32px] gap-2 mb-1 px-0">
          <span class="text-xs text-gray-500">대출명</span>
          <span class="text-xs text-gray-500">시작년차</span>
          <span class="text-xs text-gray-500">월상환액(원)</span>
          <span class="text-xs text-gray-500">기간(년)</span>
          <span></span>
        </div>
        <div id="loan-events-list" class="space-y-2 mb-3">
          ${(s.loanEvents || []).map((e, i) => loanEventRow(e, i)).join('')}
        </div>
        <button id="btn-add-loan"
          class="text-xs text-blue-400 hover:text-blue-300 border border-blue-800 rounded-lg px-3 py-1.5">
          + 대출 추가
        </button>
      </div>
      <div class="bg-gray-800 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-gray-300 mb-3">부채 정보</h3>
        ${field('inp-debt', '현재 부채 잔액 (원)', s.totalDebt ?? 0, 'number')}
        <p class="text-xs text-gray-500 mt-2">주택담보대출 등 현재 총 부채 잔액. 자산 현황의 부채/자본 비중에 반영됩니다.</p>
      </div>
      <div class="bg-gray-800 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-gray-300 mb-1">경고 기준</h3>
        <p class="text-xs text-gray-500 mb-3">
          은퇴 후 생활 가능 기간이 이 숫자보다 짧으면 자산현황 상단 카드가 빨간색으로 강조됩니다.<br>
          기본값 20 = 은퇴 후 20년 미만이면 경고 표시.
        </p>
        ${field('inp-alert-years', '경고 기준 생존 연수 (년 이하)', s.alertSurvivalYears ?? 20, 'number')}
      </div>
      <button id="btn-save-settings"
        class="w-full bg-blue-600 hover:bg-blue-500 rounded-xl py-3 text-sm font-semibold transition-colors">
        저장 후 새로고침
      </button>
    </div>`;

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const cur = storage.getSettings();
    storage.setSettings({
      ...cur,
      currentAge: Number(v('inp-age')),
      retirementAge: Number(v('inp-retirement-age')),
      annualIncome: Math.round(parseFloat(v('inp-income') || '0') * 1e8),
      savingsRate: Number(v('inp-savings-rate')) / 100,
      optimisticReturn: Number(v('inp-optimistic')) / 100,
      pessimisticReturn: Number(v('inp-pessimistic')) / 100,
      realEstateReturn: Number(v('inp-realestate-return')) / 100,
      alertSurvivalYears: Number(v('inp-alert-years')),
      totalDebt: Number(v('inp-debt')),
      loanEvents: collectLoanEvents(),
    });
    location.reload();
  });

  document.getElementById('btn-add-loan')?.addEventListener('click', () => {
    const list = document.getElementById('loan-events-list');
    const div = document.createElement('div');
    div.innerHTML = loanEventRow({ startYear: 1, monthlyPayment: 0, durationYears: 20, label: '대출' }, list.children.length);
    const row = div.firstElementChild;
    list.appendChild(row);
    row.querySelector('.btn-del-loan').addEventListener('click', () => row.remove());
  });

  document.getElementById('loan-events-list')?.querySelectorAll('.btn-del-loan').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.loan-event-row').remove());
  });
}

function renderQuitSimulator(storage) {
  const s = storage.getSettings();
  document.getElementById('quit-simulator').innerHTML = `
    <div class="bg-gray-900 border border-red-900 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-red-400 mb-4">🚨 지금 퇴사하면?</h3>
      <div class="flex items-center gap-3 mb-4">
        <label class="text-sm text-gray-400">현재 나이</label>
        <input id="inp-quit-age" type="number" value="${s.currentAge ?? 35}"
          class="bg-gray-800 rounded-lg px-3 py-1.5 text-white w-20 text-center focus:outline-none focus:ring-1 focus:ring-red-500" />
        <span class="text-sm text-gray-400">세</span>
        <button id="btn-calc-quit"
          class="bg-red-900 hover:bg-red-800 text-red-300 rounded-lg px-4 py-1.5 text-sm transition-colors">
          계산
        </button>
      </div>
      <div id="quit-result"></div>
    </div>`;

  document.getElementById('btn-calc-quit').addEventListener('click', () => {
    renderQuitResult(storage);
  });
}

function renderQuitResult(storage) {
  const s = storage.getSettings();
  const snapshots = storage.getSnapshots();
  const latestYm = Object.keys(snapshots).sort().pop();
  const currentTotal = latestYm ? snapshots[latestYm] : 0;
  const tossAssets = storage.getTossAssets();
  const obSpending = storage.getObSpending();
  const csvSpending = storage.getTossSpending();
  const records = (obSpending.records?.length ? obSpending.records : csvSpending.records) ?? [];

  // 최근 3개월 월평균 지출 계산
  const today = new Date().toISOString().slice(0, 10);
  const months = [0, 1, 2].map(offset => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - offset, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const totals = months.map(({ year, month }) =>
    records.filter(r => {
      const d = new Date(r.date);
      return d.getFullYear() === year && d.getMonth() === month;
    }).reduce((sum, r) => sum + r.amount, 0)
  );
  const monthlyExpense = Math.round(totals.reduce((a, b) => a + b, 0) / 3);

  const yearsToRetirement = (s.retirementAge ?? 55) - (s.currentAge ?? 35);

  const calcAsset = (r) => calcRetirementAsset({
    currentFinancialAsset: currentTotal,
    currentRealEstate: tossAssets.realEstate ?? 0,
    annualIncome: s.annualIncome ?? 0,
    savingsRate: s.savingsRate ?? 0.55,
    incomeGrowthRate: s.incomeGrowthRate ?? 0.02,
    financialReturn: r,
    realEstateReturn: s.realEstateReturn ?? 0.03,
    yearsToRetirement,
    loanEvents: s.loanEvents ?? [],
  });

  const retirementOpt = calcAsset(s.optimisticReturn ?? 0.08);
  const retirementPes = calcAsset(s.pessimisticReturn ?? 0.02);
  const quitNow = calcQuitNowSurvivalYears(currentTotal, monthlyExpense, s.postRetirementExpenseRatio ?? 0.8);
  const survOpt = calcRetirementSurvivalYears(retirementOpt, monthlyExpense, s.postRetirementExpenseRatio ?? 0.8);
  const survPes = calcRetirementSurvivalYears(retirementPes, monthlyExpense, s.postRetirementExpenseRatio ?? 0.8);
  const poorYears = survOpt && quitNow ? Math.max(0, Math.round((survOpt - quitNow) * 10) / 10) : null;

  document.getElementById('quit-result').innerHTML = `
    <div class="space-y-2 text-sm">
      <div class="flex justify-between">
        <span class="text-gray-400">지금 퇴사 시</span>
        <span>절망/희망 <strong class="text-red-400">${quitNow?.toFixed(1) ?? '--'}년</strong></span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-400">${s.retirementAge ?? 55}세 퇴사 시</span>
        <span>절망 <strong class="text-orange-400">${survPes?.toFixed(1) ?? '--'}년</strong>
              희망 <strong class="text-green-400">${survOpt?.toFixed(1) ?? '--'}년</strong></span>
      </div>
      ${poorYears !== null ? `
        <div class="mt-3 p-3 bg-red-950 border border-red-800 rounded-lg text-red-400 font-semibold text-center">
          🔴 지금 퇴사하면 ${s.retirementAge ?? 55}세 은퇴 대비<br>
          ${poorYears}년 동안 가난하게 지내야 합니다
        </div>` : ''}
    </div>`;
}

function renderLocationForm(storage) {
  const loc = storage.getLocationSettings();
  const el = document.createElement('div');
  el.className = 'mt-4';
  el.innerHTML = `
    <div class="bg-gray-800 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-gray-300 mb-4">📍 위치 설정 (부동산 지도 핀)</h3>
      <div class="space-y-3">
        ${locationField('loc-my-company', '내 회사 주소', loc.myCompany)}
        ${locationField('loc-spouse-company', '남편/파트너 회사 주소', loc.spouseCompany)}
        ${locationField('loc-parents-home', '부모님 집 주소', loc.parentsHome)}
      </div>
      <p class="text-xs text-gray-500 mt-3">예: "서울 강남구 테헤란로 123" — 부동산 어드바이저 최종추천결과 지도에 표시됩니다.</p>
      <button id="btn-save-locations"
        class="mt-4 w-full bg-blue-700 hover:bg-blue-600 rounded-xl py-2.5 text-sm font-semibold transition-colors">
        위치 저장
      </button>
    </div>`;
  document.getElementById('csv-upload').before(el);

  document.getElementById('btn-save-locations').addEventListener('click', () => {
    storage.setLocationSettings({
      myCompany: document.getElementById('loc-my-company').value.trim(),
      spouseCompany: document.getElementById('loc-spouse-company').value.trim(),
      parentsHome: document.getElementById('loc-parents-home').value.trim(),
    });
    alert('위치 설정이 저장되었습니다.');
  });
}

function locationField(id, label, value) {
  return `<label class="flex flex-col gap-1">
    <span class="text-xs text-gray-400">${label}</span>
    <input id="${id}" type="text" value="${value ?? ''}" placeholder="주소를 입력하세요"
      class="bg-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm" />
  </label>`;
}

function renderUpbitSettings() {
  const el = document.createElement('div');
  el.id = 'upbit-settings';
  el.className = 'mt-4';
  el.innerHTML = `
    <div class="bg-gray-800 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-gray-300 mb-1">🪙 업비트 계좌 연동</h3>
      <p class="text-xs text-gray-500 mb-3">
        업비트 잔고는 <strong class="text-gray-300">GitHub Actions</strong>가 매시간 자동 조회합니다.
        브라우저에 API 키를 저장하지 않으므로 더 안전합니다.
      </p>
      <div class="text-[10px] text-gray-400 space-y-2">
        <p class="font-semibold text-gray-300">📌 최초 1회 GitHub Secrets 등록 방법</p>
        <ol class="list-decimal list-inside space-y-1 leading-relaxed">
          <li>업비트 → 마이페이지 → Open API 관리 → API 키 발급<br>
            <span class="text-gray-500">권한: <strong class="text-gray-300">자산 조회</strong>만 체크 (주문/출금 절대 미체크)</span>
          </li>
          <li>GitHub 저장소 → Settings → Secrets and variables → Actions</li>
          <li><strong class="text-gray-300">New repository secret</strong> 클릭</li>
          <li>Name: <code class="bg-gray-700 px-1 rounded">UPBIT_ACCESS_KEY</code> / Secret: 발급받은 Access Key 붙여넣기 → Add</li>
          <li>동일하게 <code class="bg-gray-700 px-1 rounded">UPBIT_SECRET_KEY</code> 등록</li>
          <li>Actions 탭 → <strong class="text-gray-300">Fetch Stock Prices</strong> → Run workflow 클릭</li>
        </ol>
        <p class="text-gray-500 mt-2">이후 평일 매시간 자동 갱신됩니다.</p>
      </div>
    </div>`;
  document.getElementById('csv-upload').before(el);
}

function renderCsvUpload(storage) {
  document.getElementById('csv-upload').innerHTML = `
    <div class="bg-gray-800 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-gray-300 mb-1">수동 데이터 업로드 (백업용)</h3>
      <div class="bg-gray-900 rounded-lg p-3 mb-4 text-xs text-gray-400 space-y-2">
        <p class="font-semibold text-gray-300">📱 토스 소비분석 CSV 다운로드 방법</p>
        <ol class="list-decimal list-inside space-y-1 leading-relaxed">
          <li>토스 앱 하단 <strong class="text-white">홈</strong> 탭 → 상단 <strong class="text-white">소비분석</strong> 클릭</li>
          <li>우측 상단 <strong class="text-white">···</strong> (더보기) 버튼 탭</li>
          <li><strong class="text-white">내보내기</strong> 선택 → <strong class="text-white">CSV 다운로드</strong></li>
          <li>다운로드된 파일을 아래 <strong class="text-white">토스 소비분석 CSV</strong> 영역에 드래그&amp;드롭</li>
        </ol>
        <p class="text-gray-500 mt-1">※ 자산현황 CSV: 토스 앱 → 자산 탭 → 내보내기 → CSV</p>
      </div>
      <div class="grid grid-cols-1 gap-4">
        ${dropzoneHTML('dz-asset', '토스 자산현황 CSV', '예금·적금·현금 데이터')}
        ${dropzoneHTML('dz-spending', '토스 소비분석 CSV', '지출 내역 (오픈뱅킹 미연결 시)')}
      </div>
    </div>`;

  attachDropzone('dz-asset', (text) => {
    const result = parseTossAssetCsv(text);
    storage.setTossAssets({ uploadedAt: new Date().toISOString().slice(0, 10), ...result });
    alert('자산 업로드 완료');
    location.reload();
  });
  attachDropzone('dz-spending', (text) => {
    const records = parseTossSpendingCsv(text);
    storage.setTossSpending({ uploadedAt: new Date().toISOString().slice(0, 10), records });
    alert(`소비 업로드 완료 — ${records.length}건`);
    location.reload();
  });
}

function field(id, label, value, type) {
  return `<label class="flex flex-col gap-1">
    <span class="text-xs text-gray-400">${label}</span>
    <input id="${id}" type="${type}" value="${value ?? ''}"
      class="bg-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
  </label>`;
}

function incomeField(id, wonValue) {
  const 억 = wonValue > 0 ? Math.round(wonValue / 1e8 * 100) / 100 : '';
  return `<label class="flex flex-col gap-1">
    <span class="text-xs text-gray-400">연봉 (억원)</span>
    <div class="flex items-center gap-1">
      <input id="${id}" type="number" step="0.01" min="0" value="${억}"
        class="bg-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1" />
      <span class="text-xs text-gray-400 whitespace-nowrap">억원</span>
    </div>
    <span class="text-xs text-gray-500">${wonValue > 0 ? `= ₩${wonValue.toLocaleString()}` : '예: 1.1 = 1억1천만원'}</span>
  </label>`;
}

function v(id) { return document.getElementById(id)?.value ?? ''; }

function loanEventRow(e, i) {
  return `<div class="grid grid-cols-[1fr_80px_110px_80px_32px] gap-2 items-center loan-event-row">
    <input placeholder="대출명" value="${e.label ?? '대출'}"
      class="bg-gray-700 rounded px-2 py-1.5 text-sm text-white" data-loan-label />
    <input type="number" placeholder="1" value="${e.startYear ?? 1}"
      class="bg-gray-700 rounded px-2 py-1.5 text-sm text-white text-right" data-loan-start />
    <input type="number" placeholder="0" value="${e.monthlyPayment ?? 0}"
      class="bg-gray-700 rounded px-2 py-1.5 text-sm text-white text-right" data-loan-payment />
    <input type="number" placeholder="20" value="${e.durationYears ?? 20}"
      class="bg-gray-700 rounded px-2 py-1.5 text-sm text-white text-right" data-loan-duration />
    <button type="button" class="btn-del-loan text-red-500 hover:text-red-400 text-lg leading-none font-bold" title="삭제">×</button>
  </div>`;
}

function collectLoanEvents() {
  return Array.from(document.querySelectorAll('.loan-event-row')).map(row => ({
    label: row.querySelector('[data-loan-label]').value,
    startYear: Number(row.querySelector('[data-loan-start]').value),
    monthlyPayment: Number(row.querySelector('[data-loan-payment]').value),
    durationYears: Number(row.querySelector('[data-loan-duration]').value),
  })).filter(e => e.monthlyPayment > 0);
}

function dropzoneHTML(id, title, subtitle) {
  return `<div class="bg-gray-700 rounded-xl p-4">
    <div class="text-sm font-medium mb-1">${title}</div>
    <div class="text-xs text-gray-500 mb-3">${subtitle}</div>
    <div id="${id}" class="border-2 border-dashed border-gray-600 rounded-lg p-5 text-center
         text-gray-400 text-sm cursor-pointer hover:border-blue-500 transition-colors">
      CSV 파일을 드래그하거나 클릭
      <input type="file" accept=".csv" class="hidden" />
    </div>
  </div>`;
}

function attachDropzone(id, onLoad) {
  const zone = document.getElementById(id);
  const input = zone.querySelector('input');
  const read = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = e => onLoad(e.target.result);
    r.readAsText(file, 'UTF-8');
  };
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => read(e.target.files[0]));
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('border-blue-500'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('border-blue-500'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('border-blue-500');
    read(e.dataTransfer.files[0]);
  });
}
