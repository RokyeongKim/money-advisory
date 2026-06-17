import { storage } from './storage.js';
import { parseNhHoldingsCsv } from './csv-parser.js';
import { calcHoldingProfit, ASSET_LABELS, ASSET_KEYS } from './portfolio-calc.js';

let _activeTab = 'holdings';
let _buffett = null;
let _buffettNews = null;
let _nps = null;
let _mer = null;
let _tradeHistory = null;
let _activeInlinePfTab = 'holdings';
let _inlinePfContainerId = null;
let _tradeFilterPeriod = 'all';
let _tradeFilterType = 'all';

export async function renderPortfolioInline(containerId) {
  _inlinePfContainerId = containerId;
  if (!_buffett || !_mer) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '<div class="p-6 text-center text-gray-400 text-sm">데이터 불러오는 중...</div>';
    [_buffett, _buffettNews, _nps, _mer, _tradeHistory] = await Promise.all([
      fetch('data/buffett.json').then(r => r.json()).catch(() => ({ updatedAt: null, holdings: [] })),
      fetch('data/buffett_news.json').then(r => r.json()).catch(() => ({ updatedAt: null, news: [], quotes: [] })),
      fetch('data/nps.json').then(r => r.json()).catch(() => ({ updatedAt: null, assetAllocation: [], topKrHoldings: [] })),
      fetch('data/mer_blog.json').then(r => r.json()).catch(() => ({ updatedAt: null, posts: [] })),
      fetch('data/trade_history.json').then(r => r.json()).catch(() => []),
    ]);
  }
  _renderInlinePf(containerId);
}

function _renderInlinePf(containerId) {
  const wrapper = document.getElementById(containerId);
  if (!wrapper) return;

  const TABS = [
    { key: 'holdings', label: '📋 나의 주식현황' },
    { key: 'buffett',  label: '🏆 워렌버핏' },
    { key: 'nps',      label: '🏛️ 국민연금' },
    { key: 'mer',      label: '📝 메르블로그' },
    { key: 'trades',   label: '📜 거래이력' },
  ];

  wrapper.innerHTML = `
    <div class="flex border-b px-2 overflow-x-auto">
      ${TABS.map(t => `
        <button data-pf-inline-tab="${t.key}"
          class="pf-inline-tab px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
          ${_activeInlinePfTab === t.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
          ${t.label}
        </button>`).join('')}
    </div>
    <div id="pf-inline-content" class="p-5 overflow-y-auto" style="max-height:620px"></div>
  `;

  wrapper.querySelectorAll('.pf-inline-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeInlinePfTab = btn.dataset.pfInlineTab;
      _renderInlinePf(containerId);
    });
  });

  const content = document.getElementById('pf-inline-content');
  if (_activeInlinePfTab === 'holdings') _renderHoldingsTab(content);
  else if (_activeInlinePfTab === 'buffett')  _renderBuffettTab(content);
  else if (_activeInlinePfTab === 'nps')      _renderNpsTab(content);
  else if (_activeInlinePfTab === 'mer')      _renderMerTab(content);
  else if (_activeInlinePfTab === 'trades')   _renderTradesTab(content);
}

export async function openPortfolioModal() {
  [_buffett, _mer] = await Promise.all([
    fetch('data/buffett.json').then(r => r.json()).catch(() => ({ updatedAt: null, holdings: [] })),
    fetch('data/mer_blog.json').then(r => r.json()).catch(() => ({ updatedAt: null, posts: [] })),
  ]);
  _renderModal();
  document.getElementById('pf-modal').classList.remove('hidden');
}

export function closePortfolioModal() {
  document.getElementById('pf-modal')?.classList.add('hidden');
}

// ─── 모달 렌더링 ──────────────────────────────────────────────────────────────

function _renderModal() {
  let el = document.getElementById('pf-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pf-modal';
    el.className = 'fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center hidden';
    document.body.appendChild(el);
  }

  const TABS = [
    { key: 'holdings', label: '📊 내 포트폴리오' },
    { key: 'buffett',  label: '🏆 워렌 버핏' },
    { key: 'nps',      label: '🏛️ 국민연금' },
    { key: 'mer',      label: '📝 메르 블로그' },
  ];

  el.innerHTML = `
    <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col mx-4">
      <div class="flex items-center justify-between px-6 py-4 border-b">
        <h2 class="text-xl font-bold">📈 포트폴리오 어드바이저</h2>
        <button id="pf-close" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="flex border-b px-4 overflow-x-auto">
        ${TABS.map(t => `
          <button data-tab="${t.key}" class="pf-tab px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
            ${_activeTab === t.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
            ${t.label}
          </button>`).join('')}
      </div>
      <div id="pf-content" class="flex-1 overflow-y-auto p-6"></div>
    </div>`;

  document.getElementById('pf-close').addEventListener('click', closePortfolioModal);
  el.addEventListener('click', e => { if (e.target === el) closePortfolioModal(); });
  el.querySelectorAll('.pf-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      _renderModal();
      document.getElementById('pf-modal').classList.remove('hidden');
    });
  });

  const content = document.getElementById('pf-content');
  if (_activeTab === 'holdings') _renderHoldingsTab(content);
  else if (_activeTab === 'buffett') _renderBuffettTab(content);
  else if (_activeTab === 'nps')     _renderNpsTab(content);
  else if (_activeTab === 'mer')     _renderMerTab(content);
}

// ─── 나의 주식현황 탭 ─────────────────────────────────────────────────────────

function _renderHoldingsTab(container) {
  const krHoldings = [];
  const usHoldings = [];
  let updatedAt = null;
  let accounts = null;
  let yesugeumData = { total: 0, items: [] };
  try {
    const kr = JSON.parse(localStorage.getItem('_pf_stocks_kr') || 'null');
    const us = JSON.parse(localStorage.getItem('_pf_stocks_us') || 'null');
    const yg = JSON.parse(localStorage.getItem('_pf_yesugeum') || 'null');
    if (kr) { krHoldings.push(...(kr.holdings ?? [])); updatedAt = kr.updated_at; accounts = kr.accounts ?? null; }
    if (us) usHoldings.push(...(us.holdings ?? []));
    // accounts.ISA.yesu를 primary 소스로 사용해 자산현황 탭과 수치 일치
    if (accounts?.ISA?.yesu > 0 || accounts?.CMA?.yesu > 0) {
      const asOfStr = updatedAt ? new Date(updatedAt).toLocaleDateString('ko-KR') : '';
      const items = [];
      if (accounts.ISA?.yesu > 0) items.push({ institution: 'ISA중개형', amount: accounts.ISA.yesu, asOf: asOfStr });
      if (accounts.CMA?.yesu > 0) items.push({ institution: 'CMA', amount: accounts.CMA.yesu, asOf: asOfStr });
      yesugeumData = { total: items.reduce((s, i) => s + i.amount, 0), items };
    } else if (yg) yesugeumData = yg;
  } catch (_) {}

  const enrich = (h, type) => {
    const avg = h.avg_price_krw ?? 0;
    const shares = h.shares ?? 0;
    const val = h.value_krw ?? 0;
    const cost = avg * shares;
    const profit = avg ? val - cost : null;
    const profitPct = avg && cost ? profit / cost * 100 : null;
    const curPrice = type === 'kr' ? (h.current_price ?? 0) : (shares ? Math.round(val / shares) : 0);
    return { ...h, type, cost, profit, profitPct, curPrice };
  };

  const kr = krHoldings.map(h => enrich(h, 'kr'));
  const us = usHoldings.map(h => enrich(h, 'us'));

  const color = v => v >= 0 ? 'text-red-500' : 'text-blue-500';
  const fmtPct = v => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—';
  const fmtWon = v => v != null ? `${v >= 0 ? '+' : ''}${Math.round(v / 10000).toLocaleString()}만` : '—';

  const tableHtml = (rows, title) => {
    if (!rows.length) return '';
    const totalVal  = rows.reduce((s, h) => s + (h.value_krw ?? 0), 0);
    const totalCost = rows.reduce((s, h) => s + (h.cost ?? 0), 0);
    const totalProfit = totalVal - totalCost;
    const totalPct = totalCost > 0 ? totalProfit / totalCost * 100 : 0;

    return `
      <div>
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-gray-700">${title}</h3>
          <div class="text-right text-xs leading-relaxed">
            <span class="text-gray-400">총평가 </span><span class="text-gray-700 font-semibold">₩${(totalVal / 1e8).toFixed(2)}억</span>
            <span class="text-gray-400 ml-2">수익률 </span><span class="font-bold ${color(totalProfit)}">${totalProfit >= 0 ? '+' : ''}${(totalProfit / 1e8).toFixed(2)}억 (${fmtPct(totalPct)})</span>
          </div>
        </div>
        <div class="overflow-x-auto -mx-1">
          <table class="w-full text-xs min-w-[480px]">
            <thead>
              <tr class="text-gray-400 border-b border-gray-200 text-right">
                <th class="pb-1.5 text-left font-medium">종목명</th>
                <th class="pb-1.5 px-1.5 font-medium">평가손익</th>
                <th class="pb-1.5 px-1.5 font-medium">수익률</th>
                <th class="pb-1.5 px-1.5 font-medium">수량</th>
                <th class="pb-1.5 px-1.5 font-medium">평가금액</th>
                <th class="pb-1.5 px-1.5 font-medium">매입가</th>
                <th class="pb-1.5 pl-1.5 font-medium">현재가</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(h => `
                <tr class="border-b border-gray-100 last:border-0">
                  <td class="py-1.5 pr-2 font-medium text-gray-800 whitespace-nowrap">${h.name}</td>
                  <td class="py-1.5 px-1.5 text-right whitespace-nowrap font-medium ${color(h.profit ?? 0)}">${fmtWon(h.profit)}</td>
                  <td class="py-1.5 px-1.5 text-right whitespace-nowrap font-medium ${color(h.profitPct ?? 0)}">${fmtPct(h.profitPct)}</td>
                  <td class="py-1.5 px-1.5 text-right whitespace-nowrap text-gray-600">${(h.shares ?? 0).toLocaleString()}</td>
                  <td class="py-1.5 px-1.5 text-right whitespace-nowrap text-gray-700">${Math.round((h.value_krw ?? 0) / 10000).toLocaleString()}만</td>
                  <td class="py-1.5 px-1.5 text-right whitespace-nowrap text-gray-500">${(h.avg_price_krw ?? 0).toLocaleString()}</td>
                  <td class="py-1.5 pl-1.5 text-right whitespace-nowrap text-gray-700">${h.curPrice.toLocaleString()}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr class="border-t-2 border-gray-200 bg-gray-50 text-xs font-bold">
                <td class="py-2 pr-2 text-gray-600">합계</td>
                <td class="py-2 px-1.5 text-right ${color(totalProfit)}">${fmtWon(totalProfit)}</td>
                <td class="py-2 px-1.5 text-right ${color(totalPct)}">${fmtPct(totalPct)}</td>
                <td class="py-2 px-1.5 text-right text-gray-400">—</td>
                <td class="py-2 px-1.5 text-right text-gray-700">${Math.round(totalVal / 10000).toLocaleString()}만</td>
                <td class="py-2 px-1.5 text-right text-gray-500">${Math.round(totalCost / 10000).toLocaleString()}만</td>
                <td class="py-2 pl-1.5 text-right text-gray-400">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
  };

  const krTotalVal = kr.reduce((s, h) => s + (h.value_krw ?? 0), 0);
  const usTotalVal = us.reduce((s, h) => s + (h.value_krw ?? 0), 0);
  const yTotal = yesugeumData.total ?? 0;
  const _fmtB = n => n >= 1e8 ? `₩${(n / 1e8).toFixed(2)}억` : `₩${Math.round(n / 1e4).toLocaleString()}만`;
  const _pnlClr = v => v >= 0 ? 'text-red-500' : 'text-blue-500';

  const _acctRow = (a, label) => !a ? '' : `
    <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
      <div class="flex justify-between items-center mb-1.5">
        <span class="text-xs font-bold text-gray-700">📊 ${label}</span>
        <span class="text-xs font-bold text-blue-700">${_fmtB(a.eval_amount + (a.yesu ?? 0))}<span class="text-[10px] text-gray-400 font-normal ml-1">순자산</span></span>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-500">
        <span>매입 ${_fmtB(a.buy_amount)}</span>
        <span>평가 <b class="text-gray-700">${_fmtB(a.eval_amount)}</b></span>
        <span class="${_pnlClr(a.pnl)} font-semibold">${a.pnl >= 0 ? '+' : ''}${_fmtB(a.pnl)} (${a.pnl >= 0 ? '+' : ''}${a.pnl_pct}%)</span>
        ${a.yesu > 0 ? `<span class="text-green-600 font-semibold">예수금 ${_fmtB(a.yesu)}</span>` : ''}
      </div>
    </div>`;

  const totalBanner = accounts ? `
    <div class="space-y-2">
      ${_acctRow(accounts.ISA, 'ISA 중개형 ···' + accounts.ISA.account_no_last4)}
      ${_acctRow(accounts.CMA, 'CMA ···' + accounts.CMA.account_no_last4)}
    </div>` : '';

  const yesugeumSectionHtml = yTotal > 0 ? `
    <div>
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-gray-700">💵 예수금</h3>
        <div class="text-right text-xs">
          <span class="text-gray-400">합계 </span>
          <span class="text-gray-700 font-semibold">${_fmtB(yTotal)}</span>
        </div>
      </div>
      <table class="w-full text-xs">
        <thead>
          <tr class="text-gray-400 border-b border-gray-200">
            <th class="pb-1.5 text-left font-medium">계좌</th>
            <th class="pb-1.5 px-2 text-right font-medium">금액</th>
            <th class="pb-1.5 text-right font-medium">기준일</th>
          </tr>
        </thead>
        <tbody>
          ${(yesugeumData.items ?? []).map(i => `
            <tr class="border-b border-gray-100 last:border-0">
              <td class="py-1.5 pr-2 font-medium text-gray-700">${i.institution}</td>
              <td class="py-1.5 px-2 text-right font-bold text-green-600">${_fmtB(i.amount)}</td>
              <td class="py-1.5 text-right text-gray-400">${i.asOf || ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const noData = !kr.length && !us.length && yTotal === 0;
  container.innerHTML = `
    <div class="space-y-5 px-1">
      ${totalBanner}
      ${updatedAt ? `<p class="text-xs text-gray-400">갱신: ${new Date(updatedAt).toLocaleString('ko-KR')}</p>` : ''}
      ${noData ? '<p class="text-sm text-gray-400 py-8 text-center">데이터 없음 — GitHub Actions 실행 후 자동으로 채워집니다</p>' : ''}
      ${tableHtml(kr, '🇰🇷 국내주식')}
      ${tableHtml(us, '🌏 해외주식')}
      ${yesugeumSectionHtml}
      <p class="text-xs text-gray-400">* 매입가(원) 기준 수익률. 세금·수수료 미포함.</p>
    </div>`;
}

// ─── 워렌 버핏 기준 탭 ────────────────────────────────────────────────────────

function _renderBuffettTab(container) {
  const holdings = _buffett?.holdings ?? [];
  const total = holdings.reduce((s, h) => s + h.valueUsd, 0);

  container.innerHTML = `
    <div class="space-y-4">
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
        <p class="font-semibold text-amber-800 mb-1">🏆 버크셔 해서웨이 포트폴리오</p>
        <p class="text-amber-700">분기별 13F 공시 기준 (최대 45일 지연)</p>
        <p class="text-xs text-amber-600 mt-1">
          출처: <a href="${_buffett?.sourceUrl ?? '#'}" target="_blank" class="underline">${_buffett?.source ?? 'SEC EDGAR'}</a>
          | 기준일: ${_buffett?.reportDate ?? '—'}
        </p>
      </div>

      ${holdings.length === 0 ? `
        <div class="text-center py-8 text-gray-400">
          <p class="text-sm">데이터 없음</p>
          <p class="text-xs mt-1">GitHub Actions가 실행되면 자동으로 채워집니다</p>
        </div>` : `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-left text-xs text-gray-500 border-b">
              <th class="pb-2">순위</th>
              <th class="pb-2">종목</th>
              <th class="text-right pb-2">비중</th>
              <th class="text-right pb-2">평가액 (USD)</th>
            </tr></thead>
            <tbody>
              ${holdings.slice(0, 20).map((h, i) => `
                <tr class="border-b last:border-0">
                  <td class="py-2 text-gray-400">${i + 1}</td>
                  <td class="py-2 font-medium">${h.name}</td>
                  <td class="py-2 text-right font-bold text-blue-600">${h.pct}%</td>
                  <td class="py-2 text-right text-xs text-gray-500">$${(h.valueUsd / 1e9).toFixed(1)}B</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="bg-gray-50 rounded-xl p-4 text-sm">
          <p class="font-semibold text-gray-700 mb-2">💡 버핏 스타일 핵심</p>
          <p class="text-xs text-gray-500">미국 주식 집중 · 현금 소량 · 코인 0% · 장기 보유</p>
        </div>`}

      ${_renderBuffettNewsSection()}
    </div>`;
}

// ─── 국민연금 탭 ──────────────────────────────────────────────────────────────

function _renderNpsTab(container) {
  const alloc    = _nps?.assetAllocation ?? [];
  const holdings = _nps?.topKrHoldings  ?? [];
  const news     = _nps?.news            ?? [];
  const total    = _nps?.totalFundKrw    ?? 0;

  const fmtWon = v => v >= 1e12 ? `${(v / 1e12).toFixed(0)}조원` : `${(v / 1e8).toFixed(0)}억원`;

  const allocHtml = alloc.length ? `
    <div>
      <h3 class="text-sm font-semibold text-gray-700 mb-3">자산배분 현황</h3>
      <div class="space-y-2">
        ${alloc.map(a => `
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-600">${a.category}</span>
              <span class="font-bold" style="color:${a.color}">${a.pct}%</span>
            </div>
            <div class="bg-gray-100 rounded-full h-2">
              <div class="h-2 rounded-full" style="width:${a.pct}%; background:${a.color}"></div>
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  const holdingsHtml = holdings.length ? `
    <div>
      <h3 class="text-sm font-semibold text-gray-700 mb-2">국내주식 주요 보유종목</h3>
      <p class="text-xs text-gray-400 mb-2">지분율 5% 이상 공시 기준</p>
      <table class="w-full text-sm">
        <thead><tr class="text-left text-xs text-gray-400 border-b">
          <th class="pb-2">종목</th>
          <th class="text-right pb-2">지분율</th>
          <th class="text-right pb-2">보유주식</th>
        </tr></thead>
        <tbody>
          ${holdings.map((h, i) => `
            <tr class="border-b last:border-0">
              <td class="py-2">
                <span class="text-xs text-gray-400 mr-1">${i + 1}</span>
                <span class="font-medium">${h.name}</span>
              </td>
              <td class="py-2 text-right font-bold text-blue-600">${h.pct}%</td>
              <td class="py-2 text-right text-xs text-gray-500">${h.shares ?? '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const newsHtml = news.length ? `
    <div>
      <h3 class="text-sm font-semibold text-gray-600 mb-2">📰 최근 뉴스</h3>
      <div class="space-y-2">
        ${news.slice(0, 6).map(n => `
          <a href="${n.link}" target="_blank"
            class="block bg-white border border-gray-100 rounded-lg p-2.5 hover:border-blue-200 transition-colors">
            <p class="text-xs font-medium text-gray-800 leading-snug">${n.title}</p>
            <p class="text-xs text-gray-400 mt-1">${n.source} · ${n.date}</p>
          </a>`).join('')}
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="space-y-5">
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
        <p class="font-semibold text-blue-800 mb-1">🏛️ 국민연금 포트폴리오</p>
        <p class="text-blue-700">기금 규모 ${total ? fmtWon(total) : '약 1,181조원'} · ${_nps?.reportPeriod ?? '분기 공시 기준'}</p>
        <p class="text-xs text-blue-600 mt-1">
          출처: <a href="${_nps?.sourceUrl ?? 'https://fund.nps.or.kr'}" target="_blank" class="underline">국민연금 기금운용본부</a>
          | 기준일: ${_nps?.updatedAt ?? '—'}
        </p>
      </div>

      ${allocHtml}
      ${holdingsHtml}
      ${newsHtml}

      <p class="text-xs text-gray-400">* 자산배분·보유종목은 분기 공시 기준이며 실제와 차이가 있을 수 있습니다</p>
    </div>`;
}

// ─── 버핏 뉴스 & 명언 섹션 ────────────────────────────────────────────────────

function _renderBuffettNewsSection() {
  const news   = _buffettNews?.news   ?? [];
  const quotes = _buffettNews?.quotes ?? [];
  const updatedAt = _buffettNews?.updatedAt ?? null;

  const quoteHtml = quotes.length ? `
    <div class="mb-4">
      <h4 class="text-xs font-bold text-amber-700 mb-2">💬 명언</h4>
      <div class="space-y-2">
        ${quotes.slice(0, 3).map(q => `
          <div class="bg-amber-50 border-l-2 border-amber-400 pl-3 py-2">
            <p class="text-xs text-gray-700 italic">"${q.text}"</p>
            <p class="text-xs text-amber-600 mt-1">— ${q.source}</p>
          </div>`).join('')}
      </div>
    </div>` : '';

  const newsHtml = news.length ? `
    <div>
      <h4 class="text-xs font-bold text-gray-600 mb-2">📰 Recent News</h4>
      <div class="space-y-2">
        ${news.slice(0, 8).map(n => `
          <a href="${n.link}" target="_blank"
            class="block bg-white border border-gray-100 rounded-lg p-2.5 hover:border-amber-300 transition-colors">
            <p class="text-xs font-medium text-gray-800 leading-snug">${n.title}</p>
            <p class="text-xs text-gray-400 mt-1">${n.source} · ${n.date}</p>
          </a>`).join('')}
      </div>
      ${updatedAt ? `<p class="text-xs text-gray-400 mt-2 text-right">갱신: ${updatedAt}</p>` : ''}
    </div>` : `
    <div class="text-center py-4 text-gray-400 text-xs">
      뉴스 없음 — GitHub Actions 실행 후 자동으로 채워집니다
    </div>`;

  return `
    <div class="border-t border-gray-100 pt-4 space-y-3">
      <h3 class="text-sm font-semibold text-gray-700">💬 Recent Comments & News</h3>
      ${quoteHtml}
      ${newsHtml}
    </div>`;
}

// ─── 메르 블로그 탭 ────────────────────────────────────────────────────────────

function _renderMerTab(container) {
  const posts = _mer?.posts ?? [];
  const portfolioPosts = posts.filter(p => p.isPortfolio);
  const otherPosts = posts.filter(p => !p.isPortfolio).slice(0, 5);

  container.innerHTML = `
    <div class="space-y-4">
      <div class="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
        <p class="font-semibold text-green-800 mb-1">📝 메르 블로그 모니터링</p>
        <p class="text-green-700">포트폴리오/운용 관련 글을 자동으로 감지합니다</p>
        <p class="text-xs text-green-600 mt-1">
          출처: <a href="${_mer?.sourceUrl ?? 'https://blog.naver.com/ranto28'}" target="_blank" class="underline">${_mer?.source ?? '메르 블로그'}</a>
          | 갱신: ${_mer?.updatedAt ?? '—'}
        </p>
      </div>

      ${portfolioPosts.length === 0 && posts.length === 0 ? `
        <div class="text-center py-8 text-gray-400">
          <p class="text-sm">데이터 없음</p>
          <p class="text-xs mt-1">GitHub Actions가 실행되면 자동으로 채워집니다</p>
        </div>` : ''}

      ${portfolioPosts.length > 0 ? `
        <div>
          <h3 class="text-sm font-semibold text-gray-700 mb-2">📊 포트폴리오 관련 글</h3>
          <div class="space-y-2">
            ${portfolioPosts.map(p => `
              <a href="${p.link}" target="_blank"
                class="block bg-green-50 border border-green-200 rounded-lg p-3 hover:bg-green-100 transition-colors">
                <div class="text-sm font-medium text-gray-800">${p.title}</div>
                <div class="text-xs text-gray-500 mt-1">${p.date}</div>
                ${p.summary ? `<div class="text-xs text-gray-600 mt-1 line-clamp-2">${p.summary}</div>` : ''}
              </a>`).join('')}
          </div>
        </div>` : ''}

      ${otherPosts.length > 0 ? `
        <div>
          <h3 class="text-sm font-semibold text-gray-500 mb-2">최근 글</h3>
          <div class="space-y-1">
            ${otherPosts.map(p => `
              <a href="${p.link}" target="_blank"
                class="block py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div class="text-sm text-gray-700">${p.title}</div>
                <div class="text-xs text-gray-400">${p.date}</div>
              </a>`).join('')}
          </div>
        </div>` : ''}

      <div class="bg-gray-50 rounded-xl p-4 text-sm">
        <p class="font-semibold text-gray-700 mb-2">💡 메르 블로그 활용법</p>
        <p class="text-gray-600 text-xs">포트폴리오 관련 글을 읽고 메르의 현재 시장 관점과 비중을 참고하세요.</p>
      </div>
    </div>`;
}

// ─── 거래이력 탭 ─────────────────────────────────────────────────────────────

function _renderTradesTab(container) {
  // SMS 자동 포착 이력(GitHub) + 수동 입력(localStorage) 병합
  const autoTrades   = Array.isArray(_tradeHistory) ? _tradeHistory : [];
  const manualTrades = JSON.parse(localStorage.getItem('manual_trades') || '[]');
  const allTrades    = [...autoTrades, ...manualTrades]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 기간 필터
  const now    = new Date();
  const cutoff = { month: 1, q3: 3, all: 0 }[_tradeFilterPeriod] ?? 0;
  const filtered = allTrades.filter(t => {
    if (cutoff === 0) return true;
    const d = new Date(t.date);
    const diffM = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    return diffM < cutoff;
  }).filter(t => _tradeFilterType === 'all' || t.type === _tradeFilterType);

  // 실현손익 집계 (매도만)
  const sells        = filtered.filter(t => t.type === '매도' && t.realizedPnL != null);
  const totalPnL     = sells.reduce((s, t) => s + (t.realizedPnL ?? 0), 0);
  const totalBought  = filtered.filter(t => t.type === '매수').reduce((s, t) => s + t.total, 0);
  const totalSold    = sells.reduce((s, t) => s + t.total, 0);

  const fmtM = v => `${v >= 0 ? '+' : ''}${Math.round(v / 10000).toLocaleString()}만`;
  const fmtW = v => `${Math.round(v / 10000).toLocaleString()}만원`;
  const pnlColor = v => v >= 0 ? 'text-red-500' : 'text-blue-500';

  // 종목별 실현손익 집계
  const pnlByStock = {};
  sells.forEach(t => {
    if (!pnlByStock[t.name]) pnlByStock[t.name] = 0;
    pnlByStock[t.name] += t.realizedPnL ?? 0;
  });
  const pnlEntries = Object.entries(pnlByStock).sort((a, b) => b[1] - a[1]);

  container.innerHTML = `
    <div class="space-y-4">

      <!-- 요약 카드 -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-gray-50 rounded-xl p-3 text-center">
          <div class="text-[10px] text-gray-400 mb-1">총 매수금액</div>
          <div class="text-sm font-bold text-gray-700">${fmtW(totalBought)}</div>
        </div>
        <div class="bg-gray-50 rounded-xl p-3 text-center">
          <div class="text-[10px] text-gray-400 mb-1">총 매도금액</div>
          <div class="text-sm font-bold text-gray-700">${fmtW(totalSold)}</div>
        </div>
        <div class="bg-gray-50 rounded-xl p-3 text-center">
          <div class="text-[10px] text-gray-400 mb-1">실현손익</div>
          <div class="text-sm font-bold ${pnlColor(totalPnL)}">${sells.length ? fmtM(totalPnL) : '—'}</div>
        </div>
      </div>

      <!-- 종목별 실현손익 (매도 있을 때만) -->
      ${pnlEntries.length > 0 ? `
      <div class="bg-gray-50 rounded-xl p-3">
        <div class="text-xs font-semibold text-gray-600 mb-2">종목별 실현손익</div>
        <div class="space-y-1">
          ${pnlEntries.map(([name, pnl]) => `
            <div class="flex justify-between items-center text-xs">
              <span class="text-gray-600">${name}</span>
              <span class="font-semibold ${pnlColor(pnl)}">${fmtM(pnl)}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- 필터 -->
      <div class="flex gap-2 flex-wrap">
        <div class="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          ${[['all','전체'],['month','1개월'],['q3','3개월']].map(([v,l]) => `
            <button data-trade-period="${v}"
              class="px-2.5 py-1.5 transition-colors ${_tradeFilterPeriod===v?'bg-blue-500 text-white':'bg-white text-gray-500 hover:bg-gray-50'}">${l}</button>`).join('')}
        </div>
        <div class="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          ${[['all','전체'],['매수','매수'],['매도','매도']].map(([v,l]) => `
            <button data-trade-type="${v}"
              class="px-2.5 py-1.5 transition-colors ${_tradeFilterType===v?'bg-blue-500 text-white':'bg-white text-gray-500 hover:bg-gray-50'}">${l}</button>`).join('')}
        </div>
        <div class="ml-auto flex items-center gap-1 text-[10px] text-gray-400">
          <span class="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>SMS자동
          <span class="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block ml-1"></span>수동
        </div>
      </div>

      <!-- 거래 목록 -->
      <div class="overflow-x-auto -mx-1">
        ${filtered.length === 0 ? `<div class="text-center text-gray-400 text-sm py-8">거래 내역이 없습니다</div>` : `
        <table class="w-full text-xs min-w-[500px]">
          <thead>
            <tr class="text-gray-400 border-b border-gray-200 text-right">
              <th class="pb-1.5 text-left font-medium">날짜</th>
              <th class="pb-1.5 text-left font-medium px-1.5">종목</th>
              <th class="pb-1.5 px-1.5 font-medium">구분</th>
              <th class="pb-1.5 px-1.5 font-medium">수량</th>
              <th class="pb-1.5 px-1.5 font-medium">단가</th>
              <th class="pb-1.5 px-1.5 font-medium">총액</th>
              <th class="pb-1.5 pl-1.5 font-medium">실현손익</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(t => {
              const isSMS = t.source === 'SMS';
              const pnl   = t.realizedPnL;
              return `
              <tr class="border-b border-gray-100 last:border-0">
                <td class="py-1.5 pr-2 text-gray-500 whitespace-nowrap">
                  ${t.date}<span class="ml-1 w-1.5 h-1.5 rounded-full inline-block align-middle ${isSMS?'bg-green-400':'bg-blue-400'}"></span>
                </td>
                <td class="py-1.5 px-1.5 font-medium text-gray-800 whitespace-nowrap">${t.name}<span class="text-[9px] text-gray-400 ml-1">${t.ticker}</span></td>
                <td class="py-1.5 px-1.5 text-center">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${t.type==='매수'?'bg-red-50 text-red-500':'bg-blue-50 text-blue-500'}">${t.type}</span>
                </td>
                <td class="py-1.5 px-1.5 text-right text-gray-700">${t.qty.toLocaleString()}주</td>
                <td class="py-1.5 px-1.5 text-right text-gray-700">${Math.round(t.price/10000).toLocaleString()}만</td>
                <td class="py-1.5 px-1.5 text-right text-gray-700">${Math.round(t.total/10000).toLocaleString()}만</td>
                <td class="py-1.5 pl-1.5 text-right font-semibold ${pnl!=null?pnlColor(pnl):'text-gray-300'}">${pnl!=null?fmtM(pnl):'—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>

      <!-- 수동 입력 폼 -->
      <details class="border border-gray-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 select-none">
          ✏️ 수동 거래 추가 (SMS 미포착 시)
        </summary>
        <div class="p-4 bg-gray-50 border-t border-gray-200">
          <div class="grid grid-cols-2 gap-2 mb-3">
            <div>
              <div class="text-[10px] text-gray-500 mb-1">날짜</div>
              <input type="date" id="tr-date" value="${new Date().toISOString().slice(0,10)}"
                class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <div class="text-[10px] text-gray-500 mb-1">종목코드</div>
              <input type="text" id="tr-code" placeholder="006400"
                class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <div class="text-[10px] text-gray-500 mb-1">종목명</div>
              <input type="text" id="tr-name" placeholder="삼성SDI"
                class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <div class="text-[10px] text-gray-500 mb-1">구분</div>
              <select id="tr-type" class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                <option>매수</option><option>매도</option>
              </select>
            </div>
            <div>
              <div class="text-[10px] text-gray-500 mb-1">수량 (주)</div>
              <input type="number" id="tr-qty" min="1" placeholder="10"
                class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <div class="text-[10px] text-gray-500 mb-1">체결단가 (원)</div>
              <input type="number" id="tr-price" min="1" placeholder="645000"
                class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>
          <button id="btn-trade-add" class="w-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
            + 거래 추가
          </button>
        </div>
      </details>
    </div>`;

  // 필터 이벤트
  container.querySelectorAll('[data-trade-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      _tradeFilterPeriod = btn.dataset.tradePeriod;
      _renderInlinePf(_inlinePfContainerId);
    });
  });
  container.querySelectorAll('[data-trade-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      _tradeFilterType = btn.dataset.tradeType;
      _renderInlinePf(_inlinePfContainerId);
    });
  });

  // 수동 추가
  container.querySelector('#btn-trade-add')?.addEventListener('click', () => {
    const date  = container.querySelector('#tr-date')?.value;
    const code  = container.querySelector('#tr-code')?.value.trim();
    const name  = container.querySelector('#tr-name')?.value.trim();
    const type  = container.querySelector('#tr-type')?.value;
    const qty   = parseInt(container.querySelector('#tr-qty')?.value || '0');
    const price = parseInt(container.querySelector('#tr-price')?.value || '0');

    if (!date || !code || !name || qty <= 0 || price <= 0) {
      alert('모든 항목을 입력해주세요.');
      return;
    }

    const manual = JSON.parse(localStorage.getItem('manual_trades') || '[]');
    manual.unshift({
      id:          `manual_${Date.now()}`,
      date,
      ticker:      code,
      name,
      type,
      qty,
      price,
      total:       price * qty,
      avgCostAtTrade: null,
      realizedPnL: null,
      source:      'manual',
    });
    localStorage.setItem('manual_trades', JSON.stringify(manual));
    _renderInlinePf(_inlinePfContainerId);
  });
}

