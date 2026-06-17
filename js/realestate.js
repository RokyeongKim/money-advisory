import { fetchRealestate, fetchSignals, fetchPolicies, fetchWatchlist } from './api.js';
import { storage } from './storage.js';
import { rankRegionsBySignals, getBadge, getSignalStageName, SIGNAL_TYPES } from './realestate-signals.js';
import {
  calcComplexScore, rankComplexes, scoreCommute, scoreRating,
  scoreTransit, scoreDevelopment, scorePrice, scoreSupply,
  PRESETS, PRESET_LABELS, CRITERIA_LABELS, CRITERIA,
} from './realestate-scoring.js';
import { calcAvg3MonthSpending } from './calculations.js';

let _realestate = null;
let _signals = null;
let _policies = null;
let _settings = null;
let _assetCtx = null;
let _activeTab = 'status';
let _activeInlineReTab = 'status';
let _inlineReContainerId = null;
let _weightSlidersOpen = false;
let _watchExpandIdx = -1;
let _watchlistUpdatedAt = null;

// ─── 공개 API ────────────────────────────────────────────────────────────────

export function setRealestateAssetCtx(ctx) {
  _assetCtx = ctx;
}

export async function renderRealestateInline(containerId) {
  _inlineReContainerId = containerId;
  _settings = storage.getRealestateSettings();
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '<div class="p-6 text-center text-gray-400 text-sm">데이터 불러오는 중...</div>';
  let watchlistData;
  [_realestate, _signals, _policies, watchlistData] = await Promise.all([
    fetchRealestate(), fetchSignals(), fetchPolicies(), fetchWatchlist(),
  ]);
  _watchlistUpdatedAt = watchlistData?.updatedAt ?? null;
  _mergeWatchlistPrices(watchlistData);
  _renderInline(containerId);
}

function _mergeWatchlistPrices(watchlistData) {
  if (!watchlistData?.items?.length) return;
  for (const wItem of watchlistData.items) {
    const idx = _settings.watchList.findIndex(w => w.id === wItem.id);
    if (idx >= 0) {
      // 기존 항목: 가격 데이터만 업데이트 (사용자 편집 내용 보존)
      if (wItem.currentPrice > 0) {
        _settings.watchList[idx].currentPrice = wItem.currentPrice;
        if (wItem.prevPrice != null) _settings.watchList[idx].prevPrice = wItem.prevPrice;
      }
      if (wItem.hscpNo) _settings.watchList[idx].hscpNo = wItem.hscpNo;
      if (wItem.priceUpdatedAt) _settings.watchList[idx].priceUpdatedAt = wItem.priceUpdatedAt;
      if (wItem.station) _settings.watchList[idx].station = wItem.station;
      if (wItem.walkMin) _settings.watchList[idx].walkMin = wItem.walkMin;
      if (wItem.listings?.length) {
        _settings.watchList[idx].listings = wItem.listings;
        _settings.watchList[idx].listingsUpdatedAt = wItem.listingsUpdatedAt;
      }
      if (wItem.recentTrades?.length) {
        _settings.watchList[idx].recentTrades = wItem.recentTrades;
      }
    } else {
      // 신규 항목: watchlist.json에만 있는 단지 추가
      _settings.watchList.push({ ...wItem });
    }
  }
  storage.setRealestateSettings(_settings);
}

function _renderInline(containerId) {
  const wrapper = document.getElementById(containerId);
  if (!wrapper) return;

  const TABS = { status: '관심단지리스트', signals: '지역추천', location: '최종추천결과', budget: '💰 투자예산계산기' };

  wrapper.innerHTML = `
    <div class="flex border-b px-2 overflow-x-auto">
      ${Object.entries(TABS).map(([t, label]) => `
        <button data-re-inline-tab="${t}"
          class="re-inline-tab whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors
          ${_activeInlineReTab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
          ${label}
        </button>`).join('')}
    </div>
    <div id="re-inline-content" class="p-5 overflow-y-auto" style="max-height:720px"></div>
  `;

  wrapper.querySelectorAll('.re-inline-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeInlineReTab = btn.dataset.reInlineTab;
      _renderInline(containerId);
    });
  });

  const content = document.getElementById('re-inline-content');
  if (_activeInlineReTab === 'status') _renderStatusTab(content);
  else if (_activeInlineReTab === 'signals') _renderSignalsTab(content);
  else if (_activeInlineReTab === 'location') _renderLocationTab(content);
  else if (_activeInlineReTab === 'budget') _renderBudgetTab(content);
}

export async function openRealestateModal() {
  _settings = storage.getRealestateSettings();
  [_realestate, _signals, _policies] = await Promise.all([
    fetchRealestate(), fetchSignals(), fetchPolicies(),
  ]);
  _renderModal();
  document.getElementById('re-modal').classList.remove('hidden');
}

export function closeRealestateModal() {
  document.getElementById('re-modal')?.classList.add('hidden');
}

// 모달 또는 인라인 컨텍스트에 맞게 재렌더링
function _rerender() {
  if (_inlineReContainerId) {
    _renderInline(_inlineReContainerId);
  } else {
    _renderModal();
    document.getElementById('re-modal')?.classList.remove('hidden');
  }
}

// ─── 모달 렌더링 ──────────────────────────────────────────────────────────────

function _renderModal() {
  let el = document.getElementById('re-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 're-modal';
    el.className = 'fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center hidden';
    document.body.appendChild(el);
  }

  el.innerHTML = `
    <div class="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col mx-4">
      <div class="flex items-center justify-between px-6 py-4 border-b">
        <h2 class="text-xl font-bold">🏠 부동산 Advisory</h2>
        <button id="re-close" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="flex border-b px-6">
        ${['status', 'signals', 'location'].map(t => `
          <button data-tab="${t}" class="re-tab px-4 py-3 text-sm font-medium border-b-2 transition-colors ${_activeTab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
            ${{ status: '관심단지리스트', signals: '지역추천', location: '최종추천결과' }[t]}
          </button>
        `).join('')}
      </div>
      <div id="re-content" class="flex-1 overflow-y-auto p-6"></div>
    </div>
  `;

  document.getElementById('re-close').addEventListener('click', closeRealestateModal);
  el.addEventListener('click', e => { if (e.target === el) closeRealestateModal(); });
  el.querySelectorAll('.re-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      _renderModal();
      document.getElementById('re-modal').classList.remove('hidden');
    });
  });

  const content = document.getElementById('re-content');
  if (_activeTab === 'status') _renderStatusTab(content);
  else if (_activeTab === 'signals') _renderSignalsTab(content);
  else if (_activeTab === 'location') _renderLocationTab(content);
}

// ─── 현황 탭 ──────────────────────────────────────────────────────────────────

function _renderStatusTab(container) {
  const currentYear = new Date().getFullYear();
  const items = _settings.watchList;
  const alerts = items.filter(w => w.currentPrice > 0 && w.targetPrice > 0 && w.currentPrice <= w.targetPrice);
  const drops  = items.filter(w => w.currentPrice > 0 && w.prevPrice > 0 && w.currentPrice < w.prevPrice);

  container.innerHTML = `
    <div>
      ${(alerts.length || drops.length) ? `
        <div class="mb-3 space-y-1.5">
          ${alerts.map(w => `
            <div class="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-300 rounded-lg">
              <span class="text-red-600 font-bold text-sm">🔴</span>
              <span class="font-semibold text-red-700 text-sm">${w.name}</span>
              <span class="text-red-500 text-xs ml-1">현재가 ${_fmt억(w.currentPrice*1e8)} ≤ 타겟가 ${_fmt억(w.targetPrice*1e8)} — 매수 타이밍!</span>
            </div>`).join('')}
          ${drops.map(w => `
            <div class="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
              <span class="text-sm">📉</span>
              <span class="font-semibold text-orange-700 text-sm">${w.name}</span>
              <span class="text-orange-500 text-xs ml-1">${_fmt억(w.prevPrice*1e8)} → <strong>${_fmt억(w.currentPrice*1e8)}</strong> ▼${_fmt억((w.prevPrice-w.currentPrice)*1e8)} 하락</span>
            </div>`).join('')}
        </div>` : ''}

      <div class="bg-white border border-gray-200 rounded-xl overflow-hidden">
        ${items.length === 0 ? `
          <div class="py-14 text-center text-gray-400 text-sm">
            <div class="text-4xl mb-2">🏠</div>
            <p>관심 단지를 추가해보세요</p>
          </div>` : `
          <div class="flex text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-200 px-4 py-2">
            <span class="flex-1">단지명</span>
            <span class="text-gray-300">가격 · 평형 · 역세권 · 년차 · 향 · 층수</span>
            <span class="w-8 text-center">임장</span>
          </div>
          <div id="watch-rows">${items.map((w,i)=>_watchRowHtml(w,i,currentYear)).join('')}</div>`}
        <button id="btn-watch-form-toggle"
          class="w-full py-3 border-t border-gray-100 text-sm text-blue-600 font-semibold hover:bg-blue-50 flex items-center justify-center gap-1.5 transition-colors">
          <span class="text-lg leading-none">+</span> 관심단지 추가
        </button>
      </div>

      <div id="watch-add-panel" class="hidden mt-2 bg-white border border-blue-200 rounded-xl p-5">
        ${_watchAddFormHtml(null, currentYear)}
      </div>

      <p class="text-[10px] text-gray-400 mt-2">시세 자동갱신: ${_watchlistUpdatedAt ? new Date(_watchlistUpdatedAt).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'}</p>
    </div>
  `;

  _bindWatchEvents(container, currentYear);
}

function _watchRowHtml(w, idx, currentYear) {
  const pyeong  = w.areaM2 ? Math.round(w.areaM2 * 0.3025) + '평' : '—';
  const isAlert = w.currentPrice > 0 && w.targetPrice > 0 && w.currentPrice <= w.targetPrice;
  const isDrop  = w.currentPrice > 0 && w.prevPrice > 0 && w.currentPrice < w.prevPrice;
  const isOpen  = _watchExpandIdx === idx;
  const age     = w.builtYear ? (currentYear - parseInt(w.builtYear)) : null;
  const rowBg   = isAlert ? 'bg-red-50' : isOpen ? 'bg-blue-50' : 'hover:bg-gray-50';
  const priceClr= isAlert ? 'text-red-600 font-extrabold' : isDrop ? 'text-orange-500 font-bold' : 'text-blue-700 font-bold';

  const floorTxt = (w.floor && w.totalFloors) ? `${w.floor}/${w.totalFloors}층`
                 : (w.floor ? `${w.floor}층` : null);
  const infoItems = [
    w.currentPrice ? `<span class="text-xs ${priceClr}">${_fmt억(w.currentPrice*1e8)}</span>` : `<span class="text-xs text-gray-300">—</span>`,
    `<span class="text-xs text-gray-500">${pyeong}</span>`,
    `<span class="text-xs text-gray-500">${w.station ? w.station+'역 '+(w.walkMin||'?')+'분' : '—'}</span>`,
    age != null ? `<span class="text-xs text-gray-500">${age}년차</span>` : null,
    w.direction ? `<span class="text-xs text-gray-500">${w.direction}</span>` : null,
    floorTxt ? `<span class="text-xs text-gray-500">${floorTxt}</span>` : null,
  ].filter(Boolean);

  return `
    <div class="border-b border-gray-100 last:border-0" id="watch-row-wrap-${idx}">
      <div class="watch-row px-4 py-2.5 cursor-pointer ${rowBg} transition-colors select-none" data-idx="${idx}">
        <div class="flex items-center gap-1.5 mb-1">
          <span class="text-xs w-4 shrink-0 text-center">${isAlert ? '🔴' : isDrop ? '📉' : ''}</span>
          <span class="text-sm font-semibold text-gray-800 truncate flex-1" title="${w.name}">${w.name}</span>
        </div>
        <div class="flex items-center gap-1 pl-5">
          ${infoItems.join('<span class="text-gray-200 text-[10px]">·</span>')}
          <div class="watch-visited-toggle flex items-center justify-center cursor-pointer ml-auto shrink-0" data-idx="${idx}" title="임장 완료 토글">
            <input type="checkbox" class="w-4 h-4 accent-green-500 cursor-pointer" ${w.visited ? 'checked' : ''} />
          </div>
        </div>
      </div>
      ${isOpen ? `
      <div class="px-5 py-4 bg-blue-50 border-t border-blue-100 space-y-3">
        ${w.hscpNo ? `
          <a href="https://new.land.naver.com/complexes/${w.hscpNo}?a=APT&b=A1" target="_blank"
            class="flex items-center justify-center gap-1.5 w-full py-2.5 bg-[#03C75A] hover:bg-[#02b350] text-white text-xs font-bold rounded-xl transition-colors">
            🏠 네이버 부동산에서 ${pyeong} 매물 보기 ↗
          </a>` : `
          <p class="text-[11px] text-gray-400 text-center py-1">단지 ID 조회 대기 중 — 화/목/토 자동갱신 후 링크 활성화</p>`}
        ${_tradeChartSvg(w.recentTrades, idx)}
        ${w.listings?.length ? `
          <div>
            <div class="text-[11px] font-semibold text-gray-500 mb-1.5">현재 매물 ${w.listings.length}건 <span class="text-gray-400 font-normal">(${w.listingsUpdatedAt||'—'} 기준)</span></div>
            <div class="space-y-1">
              ${w.listings.map(l => `
                <div class="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-xs border border-gray-100">
                  <span class="text-gray-500 flex-1">${l.floor}층 · ${l.areaM2 ? l.areaM2+'㎡' : ''} ${l.direction||''}</span>
                  <span class="font-bold text-gray-800">${_fmt억(l.price*1e8)}</span>
                  ${l.url ? `<a href="${l.url}" target="_blank" class="text-blue-500 hover:underline">↗</a>` : ''}
                </div>`).join('')}
            </div>
          </div>` : ''}
        ${w.memo ? `<div class="text-xs text-gray-600 bg-yellow-50 border-l-2 border-yellow-400 px-3 py-2 rounded-r">${w.memo.replace(/\n/g,'<br>')}</div>` : ''}
        <div class="bg-white rounded-xl border border-gray-100 px-3 py-3 space-y-2">
          <div class="text-[11px] font-semibold text-gray-500">⭐ 내 분석</div>
          <div class="flex items-center gap-0.5">
            ${[1,2,3,4,5].map(s => `<button class="watch-star-btn text-xl leading-none transition-transform hover:scale-110" data-idx="${idx}" data-star="${s}">${s <= (w.starRating||0) ? '★' : '☆'}</button>`).join('')}
            <span class="star-rating-label text-xs text-gray-400 ml-1.5">${(w.starRating||0) > 0 ? (w.starRating)+'점' : '평가 전'}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="text-[10px] text-green-600 font-semibold mb-1">✅ 호재 / 상승 이유</div>
              <textarea class="watch-pros-input w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-green-400"
                rows="3" data-idx="${idx}" placeholder="개발호재, 교통 개선, 수요 증가 등...">${w.pros||''}</textarea>
            </div>
            <div>
              <div class="text-[10px] text-red-500 font-semibold mb-1">⚠️ 악재 / 리스크</div>
              <textarea class="watch-cons-input w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
                rows="3" data-idx="${idx}" placeholder="공급 과잉, 노후화, 교통 불편 등...">${w.cons||''}</textarea>
            </div>
          </div>
          <button class="watch-analysis-save w-full text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 rounded-lg transition-colors" data-idx="${idx}">💾 분석 저장</button>
          <div class="watch-analysis-saved text-[10px] text-green-600 text-center hidden" data-idx="${idx}">✓ 저장됨</div>
        </div>
        <div class="flex gap-2 pt-1">
          <button class="watch-edit-btn text-xs bg-white border border-gray-300 hover:border-blue-400 text-gray-600 hover:text-blue-600 px-3 py-1.5 rounded-lg transition-colors" data-idx="${idx}">✏️ 수정</button>
          <button class="watch-delete text-xs bg-white border border-gray-300 hover:border-red-400 text-gray-500 hover:text-red-500 px-3 py-1.5 rounded-lg transition-colors" data-idx="${idx}">🗑 삭제</button>
        </div>
      </div>` : ''}
    </div>
  `;
}

function _watchAddFormHtml(prefill, currentYear) {
  const p = prefill || {};
  const yr = currentYear || new Date().getFullYear();
  const age = p.builtYear ? (yr - parseInt(p.builtYear)) : null;
  const pyeong = p.areaM2 ? (p.areaM2 * 0.3025).toFixed(1) : null;
  const inp = (id, type, ph, val, extra='') =>
    `<input id="${id}" type="${type}" placeholder="${ph}" value="${val||''}" ${extra}
      class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />`;
  const sel = (id, opts, cur) =>
    `<select id="${id}" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
      ${opts.map(o => `<option value="${o}" ${o===cur?'selected':''}>${o||'선택'}</option>`).join('')}
    </select>`;

  return `
    <div class="space-y-4">
      <div class="font-semibold text-gray-700 text-sm border-b pb-2">${p.name ? '✏️ 단지 수정' : '🏠 관심단지 추가'}</div>

      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">
          <label class="text-xs text-gray-500 block mb-1">아파트명 <span class="text-red-400">*</span></label>
          ${inp('wf-name','text','예: 마포래미안푸르지오', p.name, 'autocomplete="off"')}
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">지역 (구/동)</label>
          ${inp('wf-region','text','예: 마포구', p.region)}
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">타겟가 (억)</label>
          ${inp('wf-target','number','예: 15.0', p.targetPrice, 'step="0.1"')}
        </div>
      </div>

      <div class="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-3">
        <div class="col-span-2 text-[11px] font-semibold text-gray-500 -mb-1">📍 위치 정보</div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">인근 지하철역</label>
          ${inp('wf-station','text','예: 망원', p.station)}
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">도보 (분)</label>
          ${inp('wf-walk','number','예: 8', p.walkMin||'', 'min="1" max="60"')}
        </div>
      </div>

      <div class="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-3">
        <div class="col-span-2 text-[11px] font-semibold text-gray-500 -mb-1">🏢 건물 정보</div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">전용면적 (㎡)</label>
          <div class="flex gap-2 items-center">
            ${inp('wf-area','number','예: 84.97', p.areaM2||'', 'step="0.01"').replace('class="w-full', 'class="flex-1')}
            <span id="wf-pyeong-disp" class="text-xs text-gray-400 whitespace-nowrap">${pyeong ? pyeong+'평' : '— 평'}</span>
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">향</label>
          ${sel('wf-direction', ['','남향','남동향','남서향','동향','서향','북향','북동향','북서향'], p.direction||'')}
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">준공연도</label>
          <div class="flex gap-2 items-center">
            ${inp('wf-year','number','예: 2010', p.builtYear||'', 'min="1970" max="2030"').replace('class="w-full', 'class="flex-1')}
            <span id="wf-age-disp" class="text-xs text-gray-400 whitespace-nowrap">${age ? age+'년차' : '—년차'}</span>
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">층 / 총층</label>
          <div class="flex gap-2 items-center">
            <input id="wf-floor" type="number" min="1" placeholder="층" value="${p.floor||''}"
              class="w-16 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <span class="text-gray-400 text-sm">/</span>
            <input id="wf-total-floors" type="number" min="1" placeholder="총층" value="${p.totalFloors||''}"
              class="w-16 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
        </div>
      </div>

      <div>
        <label class="text-xs text-gray-500 block mb-1">특징 / 메모</label>
        <textarea id="wf-memo" rows="3" placeholder="단지 장단점, 임장 소감 등 자유롭게..."
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400">${p.memo||''}</textarea>
      </div>

      <div class="flex items-center gap-3">
        <input type="checkbox" id="wf-visited" class="w-4 h-4 accent-green-500" ${p.visited?'checked':''} />
        <label for="wf-visited" class="text-sm text-gray-600 cursor-pointer">임장 완료</label>
      </div>

      <div class="flex gap-2 pt-1">
        <button id="btn-watch-submit" data-edit-idx="${p._editIdx ?? ''}"
          class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
          ${p.name ? '저장' : '+ 추가'}
        </button>
        <button id="btn-watch-cancel"
          class="px-5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm py-2.5 rounded-xl transition-colors">
          취소
        </button>
      </div>
    </div>
  `;
}

function _bindWatchEvents(container, currentYear) {
  const dateStr = () => {
    const d = new Date();
    return `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  };

  // 추가 폼 토글
  document.getElementById('btn-watch-form-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('watch-add-panel');
    if (!panel) return;
    const hiding = !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', hiding);
    if (!hiding) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    _bindAddFormLiveCalc(currentYear);
  });
  document.getElementById('btn-watch-cancel')?.addEventListener('click', () => {
    document.getElementById('watch-add-panel')?.classList.add('hidden');
    _watchExpandIdx = -1;
  });

  _bindAddFormLiveCalc(currentYear);

  // 임장 체크박스 — 행 펼치기 없이 직접 토글
  container.querySelectorAll('.watch-visited-toggle').forEach(wrap => {
    wrap.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(wrap.dataset.idx);
      if (isNaN(idx) || !_settings.watchList[idx]) return;
      _settings.watchList[idx].visited = !_settings.watchList[idx].visited;
      storage.setRealestateSettings(_settings);
      const cb = wrap.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = _settings.watchList[idx].visited;
    });
  });

  // 행 클릭 → 펼치기/접기 (임장 토글 클릭 시 제외)
  container.querySelectorAll('.watch-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.watch-visited-toggle')) return;
      const idx = parseInt(row.dataset.idx);
      _watchExpandIdx = _watchExpandIdx === idx ? -1 : idx;
      _rerender();
    });
  });

  // 수정 버튼
  container.querySelectorAll('.watch-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const item = _settings.watchList[idx];
      if (!item) return;
      const panel = document.getElementById('watch-add-panel');
      if (panel) {
        panel.innerHTML = _watchAddFormHtml({ ...item, _editIdx: idx }, currentYear);
        panel.classList.remove('hidden');
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        _bindAddFormLiveCalc(currentYear);
        document.getElementById('btn-watch-cancel')?.addEventListener('click', () => {
          panel.classList.add('hidden');
        });
      }
    });
  });

  // 삭제
  container.querySelectorAll('.watch-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const name = _settings.watchList[idx]?.name || '';
      if (!confirm(`"${name}" 을(를) 삭제할까요?`)) return;
      _settings.watchList.splice(idx, 1);
      _watchExpandIdx = -1;
      storage.setRealestateSettings(_settings);
      _rerender();
    });
  });

  // 별점 클릭
  container.querySelectorAll('.watch-star-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const star = parseInt(btn.dataset.star);
      if (isNaN(idx) || !_settings.watchList[idx]) return;
      _settings.watchList[idx].starRating =
        _settings.watchList[idx].starRating === star ? 0 : star;
      storage.setRealestateSettings(_settings);
      const wrap = document.getElementById(`watch-row-wrap-${idx}`);
      if (!wrap) return;
      const rating = _settings.watchList[idx].starRating;
      wrap.querySelectorAll('.watch-star-btn').forEach(b => {
        b.textContent = parseInt(b.dataset.star) <= rating ? '★' : '☆';
      });
      const lbl = wrap.querySelector('.star-rating-label');
      if (lbl) lbl.textContent = rating > 0 ? rating + '점' : '평가 전';
    });
  });

  // 분석 저장
  container.querySelectorAll('.watch-analysis-save').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      if (isNaN(idx) || !_settings.watchList[idx]) return;
      const wrap = document.getElementById(`watch-row-wrap-${idx}`);
      _settings.watchList[idx].pros = wrap?.querySelector('.watch-pros-input')?.value.trim() || '';
      _settings.watchList[idx].cons = wrap?.querySelector('.watch-cons-input')?.value.trim() || '';
      storage.setRealestateSettings(_settings);
      const saved = wrap?.querySelector(`.watch-analysis-saved[data-idx="${idx}"]`);
      if (saved) {
        saved.classList.remove('hidden');
        setTimeout(() => saved.classList.add('hidden'), 2000);
      }
    });
  });

  // 추가/수정 제출
  document.addEventListener('click', function handler(e) {
    const btn = e.target.closest('#btn-watch-submit');
    if (!btn) return;
    document.removeEventListener('click', handler);

    const name = document.getElementById('wf-name')?.value.trim();
    if (!name) { document.getElementById('wf-name')?.focus(); return; }

    const editIdx = btn.dataset.editIdx !== '' ? parseInt(btn.dataset.editIdx) : null;
    const item = {
      id: (editIdx != null ? _settings.watchList[editIdx]?.id : null) || `user-${Date.now()}`,
      name,
      region:      document.getElementById('wf-region')?.value.trim() || '',
      station:     document.getElementById('wf-station')?.value.trim() || '',
      walkMin:     parseInt(document.getElementById('wf-walk')?.value) || 0,
      areaM2:      parseFloat(document.getElementById('wf-area')?.value) || 0,
      direction:   document.getElementById('wf-direction')?.value || '',
      builtYear:   parseInt(document.getElementById('wf-year')?.value) || 0,
      floor:       parseInt(document.getElementById('wf-floor')?.value) || 0,
      totalFloors: parseInt(document.getElementById('wf-total-floors')?.value) || 0,
      targetPrice: parseFloat(document.getElementById('wf-target')?.value) || 0,
      currentPrice:(editIdx != null ? _settings.watchList[editIdx]?.currentPrice : 0) || 0,
      prevPrice:   (editIdx != null ? _settings.watchList[editIdx]?.prevPrice : 0) || 0,
      hscpNo:      (editIdx != null ? _settings.watchList[editIdx]?.hscpNo : '') || '',
      visited:     document.getElementById('wf-visited')?.checked ?? false,
      memo:        document.getElementById('wf-memo')?.value.trim() || '',
      priceUpdatedAt: (editIdx != null ? _settings.watchList[editIdx]?.priceUpdatedAt : dateStr()) || dateStr(),
      regionId:    _resolveRegionId(document.getElementById('wf-region')?.value.trim() || ''),
      manualScores:(editIdx != null ? _settings.watchList[editIdx]?.manualScores : {}) || {},
    };

    if (editIdx != null) {
      _settings.watchList[editIdx] = item;
    } else {
      _settings.watchList.push(item);
    }
    storage.setRealestateSettings(_settings);
    _watchExpandIdx = -1;
    _rerender();
  }, { once: false });
}

function _bindAddFormLiveCalc(currentYear) {
  document.getElementById('wf-area')?.addEventListener('input', e => {
    const p = parseFloat(e.target.value) * 0.3025;
    const el = document.getElementById('wf-pyeong-disp');
    if (el) el.textContent = isNaN(p) ? '— 평' : `${p.toFixed(1)}평`;
  });
  document.getElementById('wf-year')?.addEventListener('input', e => {
    const a = currentYear - parseInt(e.target.value);
    const el = document.getElementById('wf-age-disp');
    if (el) el.textContent = isNaN(a) || a < 0 ? '—년차' : `${a}년차`;
  });
}

function _fmt억(won) {
  if (!won) return '-';
  const 억 = Math.floor(won / 100000000);
  const 천만 = Math.round((won % 100000000) / 10000000);
  return 천만 > 0 ? `${억}억 ${천만}천만` : `${억}억`;
}

function _tradeChartSvg(trades, uid) {
  if (!trades?.length) return '';
  const eokVals = trades.map(t => t.amount / 1e8);
  const displayVals = [...eokVals].slice(0, 30).reverse();
  const n = displayVals.length;
  const maxV = Math.max(...eokVals);
  const minV = Math.min(...eokVals);
  const maxTrade = trades.reduce((a, b) => b.amount > a.amount ? b : a);
  const minTrade = trades.reduce((a, b) => b.amount < a.amount ? b : a);
  const range = maxV - minV || 0.1;
  const W = 200, H = 44, PX = 4, PY = 5;
  const svgPts = displayVals.map((v, i) => ({
    x: +(PX + (n > 1 ? i / (n - 1) : 0.5) * (W - PX * 2)).toFixed(1),
    y: +(H - PY - ((v - minV) / range) * (H - PY * 2)).toFixed(1),
  }));
  const polyline = svgPts.map(p => `${p.x},${p.y}`).join(' ');
  const last = svgPts[svgPts.length - 1];
  const polygon = `${polyline} ${last.x},${H} ${svgPts[0].x},${H}`;
  const gid = `cg${uid ?? 0}`;
  return `
    <div class="bg-white rounded-xl border border-gray-100 px-3 pt-3 pb-2">
      <div class="text-[11px] font-semibold text-gray-500 mb-1">📈 실거래가 추이 (최근 ${trades.length}건)</div>
      <svg viewBox="0 0 ${W} ${H}" class="w-full" style="height:${H}px">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.15"/>
            <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${n >= 2 ? `<polygon points="${polygon}" fill="url(#${gid})"/>
        <polyline fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${polyline}"/>` : ''}
        <circle cx="${last.x}" cy="${last.y}" r="3" fill="#3b82f6"/>
      </svg>
      <div class="flex justify-between text-[9px] text-gray-400 -mt-0.5 mb-2">
        <span>${trades[trades.length-1]?.date?.slice(0,7)||'—'}</span>
        <span>${trades[0]?.date?.slice(0,7)||'—'}</span>
      </div>
      <div class="grid grid-cols-3 gap-1 text-center">
        <div class="bg-blue-50 rounded-lg px-1 py-1.5">
          <div class="text-[9px] text-gray-400">최근거래</div>
          <div class="text-xs font-bold text-blue-700">${_fmt억(eokVals[0]*1e8)}</div>
          <div class="text-[9px] text-gray-400">${trades[0]?.date?.slice(0,7)||''}</div>
        </div>
        <div class="bg-red-50 rounded-lg px-1 py-1.5">
          <div class="text-[9px] text-gray-400">3년 최고</div>
          <div class="text-xs font-bold text-red-500">${_fmt억(maxV*1e8)}</div>
          <div class="text-[9px] text-gray-400">${maxTrade?.date?.slice(0,7)||''}</div>
        </div>
        <div class="bg-green-50 rounded-lg px-1 py-1.5">
          <div class="text-[9px] text-gray-400">3년 최저</div>
          <div class="text-xs font-bold text-green-600">${_fmt억(minV*1e8)}</div>
          <div class="text-[9px] text-gray-400">${minTrade?.date?.slice(0,7)||''}</div>
        </div>
      </div>
    </div>
  `;
}

// ─── 최종추천결과 탭 ──────────────────────────────────────────────────────────

function _buildTotalList() {
  const complexes = _realestate?.complexes ?? [];
  const signalRegions = _signals?.regions ?? [];
  const weights = _settings.weights;

  const signalMap = {};
  for (const r of signalRegions) {
    const [ranked] = rankRegionsBySignals([r]);
    signalMap[r.id] = ranked.totalScore;
  }

  const watchIds = new Set(_settings.watchList.map(w => w.id));
  const watchedWithManual = _settings.watchList.map(w => {
    const baseComplex = complexes.find(c => c.id === w.id) ?? {};
    return { ...baseComplex, ...w, _isWatched: true };
  });

  const topRegionIds = rankRegionsBySignals(signalRegions).slice(0, 10).map(r => r.id);
  const recommended = complexes
    .filter(c => topRegionIds.includes(c.regionId) && !watchIds.has(c.id))
    .slice(0, 20)
    .map(c => ({ ...c, _isWatched: false }));

  const all = [...watchedWithManual, ...recommended];

  return all.map(c => {
    const ms = c.manualScores ?? {};
    const rawScores = {
      commute:     scoreCommute(ms.commute ?? 30),
      school:      scoreRating(ms.school ?? 3),
      transit:     scoreTransit(ms.transit ?? 1),
      development: scoreDevelopment(signalMap[c.regionId] ?? 0),
      commercial:  scoreRating(ms.commercial ?? 3),
      price:       scorePrice(c.recentPrice ?? 0, complexes.filter(x => x.regionId === c.regionId)),
      supply:      scoreSupply(ms.supply ?? c.newSupply2y ?? 500),
      infra:       scoreRating(ms.infra ?? 3),
      forest:      scoreRating(ms.forest ?? 3),
    };
    return { ...c, rawScores, totalScore: calcComplexScore(rawScores, weights) };
  });
}

function _renderLocationTab(container) {
  const weights = _settings.weights;
  const preset = _settings.preset;
  const totalList = rankComplexes(_buildTotalList());

  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex gap-2">
        <input id="re-map-search" type="text" placeholder="단지명·주소 검색 후 Enter (지도 이동)"
          class="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400">
        <button id="re-map-search-btn" class="px-3 py-1.5 bg-blue-500 text-white rounded text-sm">🔍</button>
        <a href="https://new.land.naver.com" target="_blank" rel="noopener"
          class="px-3 py-1.5 bg-green-600 text-white rounded text-sm whitespace-nowrap">네이버부동산 →</a>
      </div>
      <p class="text-xs text-gray-400 -mt-2">💡 지도를 클릭하면 관심단지를 바로 추가할 수 있습니다 (핀 클릭 → 네이버부동산 링크)</p>
      <div id="re-location-map" style="height:420px;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;"></div>
      <div class="bg-gray-50 rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex gap-2">
            ${Object.entries(PRESET_LABELS).map(([k, label]) => `
              <button data-preset="${k}" class="preset-btn px-3 py-1 rounded-full text-xs font-medium ${preset === k ? 'bg-blue-500 text-white' : 'bg-white border text-gray-600'}">
                ${label}
              </button>
            `).join('')}
          </div>
          <button id="re-weight-toggle" class="text-xs text-blue-500">가중치 조정 ▼</button>
        </div>
        <div class="grid grid-cols-9 gap-1 text-center text-xs">
          ${CRITERIA.map(k => `
            <div>
              <div class="text-gray-500 mb-1">${CRITERIA_LABELS[k]}</div>
              <div class="font-bold text-blue-600">${weights[k]}%</div>
            </div>
          `).join('')}
        </div>
        <div id="re-weight-sliders" class="${_weightSlidersOpen ? '' : 'hidden'} mt-3 space-y-2">
          ${CRITERIA.map(k => `
            <div class="flex items-center gap-2 text-xs">
              <span class="w-16 text-gray-600">${CRITERIA_LABELS[k]}</span>
              <input type="range" min="0" max="50" value="${weights[k]}" data-criterion="${k}"
                class="weight-slider flex-1 h-1 bg-gray-200 rounded appearance-none cursor-pointer">
              <span class="w-8 text-right font-medium" id="w-${k}">${weights[k]}%</span>
            </div>
          `).join('')}
          <p class="text-xs text-gray-400">합계: <span id="re-weight-total">${Object.values(weights).reduce((s,v)=>s+v,0)}</span>% (100%여야 함)</p>
        </div>
      </div>

      <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-1">
        <div class="text-sm font-medium text-blue-700 mb-2">💰 투자 가능 예산 설정</div>
        <div class="flex items-center gap-2">
          <input type="number" id="re-budget-min" placeholder="최소" min="0" step="0.5"
            value="${(_settings.investmentBudget?.min ?? 0) || ''}"
            class="border rounded px-2 py-1 text-sm w-20 text-right">
          <span class="text-sm text-gray-500">억 ~</span>
          <input type="number" id="re-budget-max" placeholder="최대" min="0" step="0.5"
            value="${(_settings.investmentBudget?.max ?? 0) || ''}"
            class="border rounded px-2 py-1 text-sm w-20 text-right">
          <span class="text-sm text-gray-500">억원</span>
          <button id="re-budget-save" class="bg-blue-500 text-white text-xs px-3 py-1.5 rounded">적용</button>
        </div>
        ${(_settings.investmentBudget?.max > 0) ? `<p class="text-xs text-blue-600 mt-1">현재 예산: ${_settings.investmentBudget.min ?? 0}억 ~ ${_settings.investmentBudget.max}억원 — 시세 있는 단지는 예산 초과 시 표시됩니다</p>` : '<p class="text-xs text-gray-400 mt-1">예산 입력 시 적합 단지를 먼저 표시합니다</p>'}
      </div>
      <h3 class="font-semibold text-gray-700">TOTAL LIST (${totalList.length}개 단지, 알고리즘 추천순)</h3>
      <div class="space-y-2" id="re-total-list">
        ${totalList.map((c, i) => {
          const budget = _settings.investmentBudget ?? {};
          const price억 = c.recentPrice ? c.recentPrice / 1e8 : null;
          const overBudget = budget.max > 0 && price억 !== null && price억 > budget.max;
          const underBudget = budget.max > 0 && price억 !== null && price억 < (budget.min ?? 0);
          const budgeBadge = overBudget
            ? `<span class="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded ml-1">예산초과</span>`
            : underBudget
              ? `<span class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded ml-1">예산미달</span>`
              : (price억 !== null && budget.max > 0)
                ? `<span class="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded ml-1">예산적합</span>`
                : '';
          const priceLabel = price억 !== null ? `<span class="text-xs text-gray-400 ml-1">${price억.toFixed(1)}억</span>` : '';
          const naverUrl = `https://new.land.naver.com/search?query=${encodeURIComponent(c.name)}`;
          return `
          <div class="complex-row border rounded-lg p-3 cursor-pointer hover:bg-gray-50 ${overBudget ? 'opacity-60' : ''}" data-id="${c.id}">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <span class="text-lg font-bold text-gray-400 shrink-0">${i + 1}</span>
                <div class="min-w-0">
                  <span class="font-medium">${c.name}</span>
                  ${!c._isWatched ? '<span class="ml-1 text-xs bg-blue-100 text-blue-600 px-1 rounded">추천</span>' : '<span class="ml-1 text-xs bg-purple-100 text-purple-600 px-1 rounded">관심</span>'}
                  ${budgeBadge}
                  <span class="text-xs text-gray-400 ml-1">${c.region ?? ''}</span>
                  ${priceLabel}
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <a href="${naverUrl}" target="_blank" rel="noopener"
                  onclick="event.stopPropagation()"
                  class="text-xs text-blue-400 hover:text-blue-600 hover:underline">네이버 →</a>
                <span class="text-xl font-bold text-blue-600">${c.totalScore}점</span>
              </div>
            </div>
            <div class="grid grid-cols-9 gap-1 mt-2 text-center text-xs text-gray-500">
              ${CRITERIA.map(k => `<div title="${CRITERIA_LABELS[k]}">${c.rawScores[k]}</div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="border-t pt-4">
        <h4 class="text-sm font-medium text-gray-700 mb-1">직접 관심단지 추가 <span class="text-xs text-gray-400 font-normal">(지도 클릭 추가도 가능)</span></h4>
        <div class="flex gap-2">
          <input id="re-add-name" type="text" placeholder="단지명" class="flex-1 border rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-400">
          <input id="re-add-region" type="text" placeholder="구/동 (선택)" class="w-28 border rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-400">
          <button id="re-add-btn" class="px-3 py-1 bg-purple-500 text-white rounded text-sm">추가</button>
        </div>
        <p class="text-[10px] text-gray-400 mt-1">단지명만 입력해도 추가됩니다. 구/동 입력 시 알고리즘 점수가 반영됩니다.</p>
      </div>
    </div>
  `;

  container.querySelectorAll('.complex-row').forEach(row => {
    row.addEventListener('click', () => _showComplexDetail(row.dataset.id, totalList, container));
  });

  container.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _settings.preset = btn.dataset.preset;
      _settings.weights = { ...PRESETS[btn.dataset.preset] };
      storage.setRealestateSettings(_settings);
      _rerender();
    });
  });

  document.getElementById('re-weight-toggle').addEventListener('click', () => {
    _weightSlidersOpen = !_weightSlidersOpen;
    document.getElementById('re-weight-sliders').classList.toggle('hidden', !_weightSlidersOpen);
  });

  container.querySelectorAll('.weight-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      const k = slider.dataset.criterion;
      _settings.weights[k] = parseInt(slider.value);
      document.getElementById(`w-${k}`).textContent = `${slider.value}%`;
      const total = Object.values(_settings.weights).reduce((s, v) => s + v, 0);
      document.getElementById('re-weight-total').textContent = total;
    });
    slider.addEventListener('change', () => {
      storage.setRealestateSettings(_settings);
      _rerender();
    });
  });

  document.getElementById('re-budget-save')?.addEventListener('click', () => {
    const min = parseFloat(document.getElementById('re-budget-min').value) || 0;
    const max = parseFloat(document.getElementById('re-budget-max').value) || 0;
    _settings.investmentBudget = { min, max };
    storage.setRealestateSettings(_settings);
    _rerender();
  });

  document.getElementById('re-add-btn').addEventListener('click', () => {
    const name = document.getElementById('re-add-name').value.trim();
    if (!name) { document.getElementById('re-add-name').focus(); return; }
    const region = document.getElementById('re-add-region').value.trim() || '미정';
    const id = `user-${name.slice(0, 8).toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    _settings.watchList.push({ id, name, region, regionId: _resolveRegionId(region), manualScores: {} });
    storage.setRealestateSettings(_settings);
    _rerender();
  });

  setTimeout(() => _initInteractiveLocationMap(totalList, container), 100);
}

function _showComplexDetail(id, totalList, container) {
  const c = totalList.find(x => x.id === id);
  if (!c) return;

  const overlay = document.createElement('div');
  overlay.id = 're-detail-overlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-40 z-[999] flex items-center justify-center';
  overlay.innerHTML = `
    <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-lg">${c.name} — ${c.totalScore}점</h3>
        <button id="re-detail-close" class="text-gray-400 text-2xl">&times;</button>
      </div>
      <div class="space-y-2 text-sm">
        ${CRITERIA.map(k => {
          const score = c.rawScores[k];
          const icon = score >= 70 ? '✅' : score >= 40 ? '⚠️' : '❌';
          return `<div class="flex justify-between">
            <span>${icon} ${CRITERIA_LABELS[k]}</span>
            <span class="font-medium">${score}/100</span>
          </div>`;
        }).join('')}
        <hr class="my-2">
        <div class="text-gray-500">전세가율: ${c.leasePriceRate != null ? Math.round(c.leasePriceRate * 100) + '%' : '미입력'} (참고)</div>
        <div class="text-gray-500">현재가: ${_fmt억(c.recentPrice)}</div>
      </div>
      ${c._isWatched && c.id.startsWith('user-') ? `
        <button class="mt-4 w-full py-2 bg-red-50 text-red-600 rounded text-sm" id="re-remove-complex" data-id="${c.id}">
          관심 단지에서 제거
        </button>
      ` : ''}
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('re-detail-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('re-remove-complex')?.addEventListener('click', e => {
    _settings.watchList = _settings.watchList.filter(w => w.id !== e.target.dataset.id);
    storage.setRealestateSettings(_settings);
    overlay.remove();
    _rerender();
  });
}

// ─── 지역추천 탭 ──────────────────────────────────────────────────────────────

function _renderSignalsTab(container) {
  const regions = _signals?.regions ?? [];
  const policies = _policies?.policies ?? [];
  const ranked = rankRegionsBySignals(regions);
  const signalTypeKeys = Object.keys(SIGNAL_TYPES);

  container.innerHTML = `
    <div class="space-y-4">
      <h3 class="font-semibold text-gray-700">지역 추천 랭킹</h3>
      <p class="text-xs text-gray-400">최종 갱신: ${_signals?.updatedAt ?? '-'} | 수동 편집: data/signals.json</p>
      <div id="re-signals-map" style="height:280px;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;"></div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-500 border-b">
              <th class="pb-2 w-8">순위</th>
              <th class="pb-2">지역</th>
              <th class="pb-2 text-center">총점</th>
              ${signalTypeKeys.map(k => `<th class="pb-2 text-center text-xs">${SIGNAL_TYPES[k].label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${ranked.map((r, i) => {
              const byType = {};
              for (const s of r.signals) {
                if (!byType[s.type] || s.stageIndex > byType[s.type].stageIndex) byType[s.type] = s;
              }
              return `
                <tr class="border-b last:border-0 hover:bg-gray-50 cursor-pointer signal-row" data-regionid="${r.id}">
                  <td class="py-2 text-gray-400 font-bold">${i + 1}</td>
                  <td class="py-2 font-medium">${r.name}${r.note ? `<div class="text-[10px] text-gray-400 font-normal">${r.note}</div>` : ''}</td>
                  <td class="py-2 text-center font-bold text-blue-600">${r.totalScore}</td>
                  ${signalTypeKeys.map(k => {
                    const s = byType[k];
                    if (!s) return '<td class="py-2 text-center text-gray-300">—</td>';
                    return `<td class="py-2 text-center text-xs">${getBadge(s.stageIndex, SIGNAL_TYPES[k].maxStage)}</td>`;
                  }).join('')}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="border-t pt-4">
        <div class="flex justify-between items-center mb-3">
          <h3 class="font-semibold text-gray-700">📋 부동산 정책 업데이트</h3>
          <span class="text-xs text-gray-400">갱신: ${_policies?.updatedAt ?? '-'}</span>
        </div>
        <div class="space-y-2">
          ${policies.map(p => `
            <div class="flex gap-3 text-sm p-2 bg-gray-50 rounded">
              <span class="text-gray-400 text-xs whitespace-nowrap mt-0.5">${p.date}</span>
              <div>
                <span class="font-medium">${p.title}</span>
                <span class="text-gray-500 ml-2">${p.detail}</span>
              </div>
            </div>
          `).join('')}
        </div>
        <p class="text-xs text-gray-400 mt-2">정책 추가/수정: data/policies.json 직접 편집</p>
      </div>
    </div>
  `;

  container.querySelectorAll('.signal-row').forEach(row => {
    row.addEventListener('click', () => _showRegionDetail(row.dataset.regionid, ranked));
  });

  setTimeout(() => _initSignalsMap(ranked.slice(0, 3)), 100);
}

function _showRegionDetail(regionId, ranked) {
  const r = ranked.find(x => x.id === regionId);
  if (!r) return;

  const overlay = document.createElement('div');
  overlay.id = 're-signal-overlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-40 z-[999] flex items-center justify-center';
  overlay.innerHTML = `
    <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-lg">${r.name} — ${r.totalScore}점</h3>
        <button id="re-signal-close" class="text-gray-400 text-2xl">&times;</button>
      </div>
      <div class="space-y-3">
        ${r.signals.map(s => {
          const typeInfo = SIGNAL_TYPES[s.type] ?? {};
          return `
            <div class="border rounded-lg p-3">
              <div class="flex justify-between items-start">
                <div>
                  <span class="font-medium text-sm">${s.name}</span>
                  <span class="ml-2 text-xs text-gray-400">${typeInfo.label ?? s.type}</span>
                </div>
                <span class="text-blue-600 font-bold text-sm">${s.stageIndex + 1}점</span>
              </div>
              <div class="text-xs text-gray-500 mt-1">
                단계: ${getBadge(s.stageIndex, typeInfo.maxStage ?? 5)} ${getSignalStageName(s)}
              </div>
              ${s.expectedCompletion ? `<div class="text-xs text-gray-400">예상 완료: ${s.expectedCompletion}</div>` : ''}
              <div class="text-xs text-gray-400">출처: ${s.source}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('re-signal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ─── Leaflet 지도 헬퍼 ───────────────────────────────────────────────────────

const MEDAL = ['🥇', '🥈', '🥉'];
const PIN_COLORS = {
  myCompany:     { bg: '#3b82f6', label: '내 회사' },
  spouseCompany: { bg: '#8b5cf6', label: '남편/파트너 회사' },
  parentsHome:   { bg: '#f59e0b', label: '부모님 집' },
  complex:       { bg: '#10b981', label: '추천 단지' },
};

function _makeMap(containerId, zoom = 11) {
  const el = document.getElementById(containerId);
  if (!el) return null;
  el.innerHTML = '';
  const map = L.map(el, { zoomControl: true }).setView([37.5665, 126.9780], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  return map;
}

function _pinOverlay(map, latlng, label, bgColor) {
  const icon = L.divIcon({
    className: '',
    html: `<div style="background:${bgColor};color:#fff;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);transform:translateX(-50%)">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
  return L.marker(latlng, { icon }).addTo(map);
}

async function _geocode(address) {
  try {
    const q = encodeURIComponent(address);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${q}&countrycodes=kr&limit=1`,
      { headers: { 'Accept-Language': 'ko,en' } }
    );
    const data = await res.json();
    if (data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch (_) {}
  return null;
}

async function _initSignalsMap(top3) {
  const map = _makeMap('re-signals-map', 11);
  if (!map) return;
  const points = [];
  for (let i = 0; i < top3.length; i++) {
    const r = top3[i];
    const addr = r.name.includes('서울') ? r.name : `서울 ${r.name}`;
    const latlng = await _geocode(addr);
    if (latlng) {
      points.push(latlng);
      const color = i === 0 ? '#ef4444' : i === 1 ? '#f97316' : '#eab308';
      _pinOverlay(map, latlng, `${MEDAL[i]} ${r.name} (${r.totalScore}점)`, color);
    }
  }
  if (points.length > 1) map.fitBounds(points, { padding: [40, 40] });
  else if (points.length === 1) map.setView(points[0], 12);
}

// 구 이름 → signals.json regionId 매핑
const REGION_ID_MAP = {
  '마포': 'mapo', '마포구': 'mapo',
  '용산': 'yongsan', '용산구': 'yongsan',
  '서초': 'seocho', '서초구': 'seocho',
  '강남': 'gangnam', '강남구': 'gangnam',
  '송파': 'songpa', '송파구': 'songpa',
  '분당': 'bundang', '분당구': 'bundang', '성남': 'bundang', '판교': 'bundang', '백현': 'bundang',
};
function _resolveRegionId(region) {
  for (const [key, id] of Object.entries(REGION_ID_MAP)) {
    if (region.includes(key)) return id;
  }
  return region;
}

// 좌표 → 행정동 이름 (Nominatim reverse geocode)
async function _reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'ko' } }
    );
    const d = await res.json();
    const a = d.address ?? {};
    return a.borough || a.suburb || a.neighbourhood || a.county || '';
  } catch { return ''; }
}

// 관심단지 핀 아이콘
function _complexPinIcon(label) {
  return L.divIcon({
    className: '',
    html: `<div style="background:#7c3aed;color:#fff;padding:4px 8px;border-radius:14px;font-size:11px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,.25);transform:translateX(-50%)">${label}</div>`,
    iconSize: [0, 0], iconAnchor: [0, 0],
  });
}

async function _initInteractiveLocationMap(totalList, container) {
  const map = _makeMap('re-location-map', 12);
  if (!map) return;
  const loc = storage.getLocationSettings();
  const points = [];

  // 생활권 고정 핀
  const addContextPin = async (address, label, color) => {
    if (!address) return;
    const ll = await _geocode(address);
    if (ll) { points.push(ll); _pinOverlay(map, ll, label, color); }
  };
  await Promise.all([
    addContextPin(loc.myCompany,     PIN_COLORS.myCompany.label,     PIN_COLORS.myCompany.bg),
    addContextPin(loc.spouseCompany, PIN_COLORS.spouseCompany.label, PIN_COLORS.spouseCompany.bg),
    addContextPin(loc.parentsHome,   PIN_COLORS.parentsHome.label,   PIN_COLORS.parentsHome.bg),
  ]);

  // 관심단지 핀 (watchList)
  const watched = totalList.filter(c => c._isWatched);
  for (const c of watched) {
    let ll = null;
    if (c.lat && c.lng) {
      ll = [c.lat, c.lng];
    } else {
      const addr = c.region ? `${c.region} ${c.name}` : c.name;
      ll = await _geocode(addr);
    }
    if (ll) {
      points.push(ll);
      const marker = L.marker(ll, { icon: _complexPinIcon(c.name) }).addTo(map);
      const naverUrl = `https://new.land.naver.com/search?query=${encodeURIComponent(c.name)}`;
      marker.bindPopup(
        `<div style="min-width:160px"><strong style="font-size:13px">${c.name}</strong><br>
        <span style="color:#6b7280;font-size:11px">${c.region ?? ''}</span><br>
        <a href="${naverUrl}" target="_blank" rel="noopener"
          style="color:#3b82f6;font-size:11px;text-decoration:none">🔍 네이버부동산에서 보기 →</a></div>`
      );
    }
  }

  if (points.length > 1) map.fitBounds(points, { padding: [50, 50] });
  else map.setView([37.5665, 126.9780], 12);

  // 지도 클릭 → 관심단지 추가 팝업
  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'min-width:200px;font-family:sans-serif';
    wrap.innerHTML = `
      <div style="font-weight:bold;font-size:13px;margin-bottom:6px">📌 관심단지 추가</div>
      <input id="mpop-name" type="text" placeholder="단지명 (필수)"
        style="width:100%;border:1px solid #d1d5db;border-radius:4px;padding:5px 8px;font-size:12px;margin-bottom:4px;box-sizing:border-box">
      <input id="mpop-region" type="text" placeholder="구/동 (예: 마포구)"
        style="width:100%;border:1px solid #d1d5db;border-radius:4px;padding:5px 8px;font-size:12px;margin-bottom:6px;box-sizing:border-box">
      <button id="mpop-btn"
        style="width:100%;background:#3b82f6;color:#fff;border:none;padding:6px;border-radius:4px;font-size:12px;cursor:pointer;font-weight:bold">
        ＋ 추가
      </button>`;
    const popup = L.popup({ closeOnClick: false, maxWidth: 240 })
      .setLatLng(e.latlng).setContent(wrap).openOn(map);
    // 역지오코드로 구 자동완성
    _reverseGeocode(lat, lng).then(g => {
      const inp = document.getElementById('mpop-region');
      if (inp && g && !inp.value) inp.value = g;
    });
    document.getElementById('mpop-btn')?.addEventListener('click', () => {
      const name = document.getElementById('mpop-name')?.value?.trim();
      const region = document.getElementById('mpop-region')?.value?.trim() || '미정';
      if (!name) { document.getElementById('mpop-name').focus(); return; }
      const id = `user-${name.slice(0,8).toLowerCase().replace(/\s+/g,'-')}-${Date.now()}`;
      _settings.watchList.push({ id, name, region, regionId: _resolveRegionId(region), lat, lng, manualScores: {} });
      storage.setRealestateSettings(_settings);
      map.closePopup();
      _rerender();
    });
  });

  // 검색 버튼
  container.querySelector('#re-map-search-btn')?.addEventListener('click', async () => {
    const q = container.querySelector('#re-map-search')?.value?.trim();
    if (!q) return;
    const ll = await _geocode(q.includes('구') || q.includes('동') ? q : `서울 ${q}`);
    if (ll) {
      map.setView(ll, 15);
      L.popup().setLatLng(ll).setContent(
        `<b>${q}</b><br><span style="font-size:11px;color:#6b7280">지도 클릭 → 관심단지 추가</span>`
      ).openOn(map);
    }
  });
  container.querySelector('#re-map-search')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') container.querySelector('#re-map-search-btn')?.click();
  });
}

// ─── 투자예산 계산기 탭 ───────────────────────────────────────────────────────

// 목표 지역(마포·용산·서초·강남·송파·분당) 16~18억 타겟 단지 — 84㎡ 기준 추정 시세
// ※ 가격은 추정치. 네이버부동산·호갱노노에서 실시간 확인 필요
const CURATED_APTS = [
  {
    name: '마포래미안푸르지오',
    region: '마포구 염리동',
    area: 84,
    built: 2014,
    units: 3885,
    minP: 1_500_000_000,
    maxP: 1_750_000_000,
    reasons: ['5호선 마포역·애오개역 + 공덕 멀티허브(공항철도·경의중앙선·6호선) 도보권', '2014년 재건축 완료 3,885세대 대단지, 커뮤니티·학군 우수'],
    upside: '용산–마포 연결 지하도로(서울시 계획) 개통 시 강남 접근성 대폭 향상. 공덕역 일대 업무수요 꾸준 유입.',
    refNote: '서울시 도시교통실 용산-마포 지하도로 계획 / 네이버부동산 실시간 시세·층별 호가 확인 권장',
    naverSearch: '마포래미안푸르지오',
  },
  {
    name: '마포한강자이',
    region: '마포구 합정동',
    area: 84,
    built: 2007,
    units: 705,
    minP: 1_600_000_000,
    maxP: 1_900_000_000,
    reasons: ['한강 조망 가능, 합정·홍대 상권 도보권', '6호선·2호선 환승권, 광역버스 다수'],
    upside: '한강변 조망권 희소가치 높아 시세 방어력 강함. 용산 개발 시 마포 전반 수요 확대 연동.',
    refNote: '호갱노노에서 층별·향별 가격 분포 확인 권장',
    naverSearch: '마포한강자이',
  },
  {
    name: '이촌 한가람',
    region: '용산구 이촌동',
    area: 84,
    built: 1999,
    units: 1372,
    minP: 1_700_000_000,
    maxP: 2_100_000_000,
    reasons: ['한강 조망·이촌역(4호선·경의중앙선) 도보 5분', '용산국제업무지구 예정지 1km 이내 직접 수혜권'],
    upside: '용산 국제업무지구(2030년대 목표, 연면적 570만㎡) 개발 시 이촌 일대 주거 프리미엄 재평가 기대. GTX-B 용산역(2030 예정).',
    refNote: '서울시 2040 서울도시기본계획 용산 국제업무지구 / 국토부 GTX-B 노선도',
    naverSearch: '이촌한가람아파트',
  },
  {
    name: '헬리오시티',
    region: '송파구 가락동',
    area: 84,
    built: 2018,
    units: 9510,
    minP: 1_550_000_000,
    maxP: 1_850_000_000,
    reasons: ['9호선 한성백제역·8호선 가락시장역 더블역세권', '9,510세대 자급자족 대단지 — 커뮤니티·학군·편의시설 완비'],
    upside: 'GTX-A 수서역(2024 개통) 인접으로 강남·판교 이동 획기적 단축. 잠실 MICE 복합개발(2030년대)·스타필드 잠실(2027 예정) 간접 수혜.',
    refNote: '국토부 GTX-A 개통 보도 / 서울시 잠실 MICE 복합개발 계획',
    naverSearch: '헬리오시티',
  },
  {
    name: '판교 e편한세상',
    region: '성남시 분당구 삼평동',
    area: 84,
    built: 2011,
    units: 1241,
    minP: 1_400_000_000,
    maxP: 1_700_000_000,
    reasons: ['신분당선 판교역 도보권 (강남 30분)', 'IT 대기업 R&D 클러스터 — 카카오·네이버·크래프톤 직주근접'],
    upside: '판교3테크노밸리(2027년 본격 가동) 입주 시 업무 수요 추가. 신분당선 수원 연장(2027 예정) 노선 허브화. 분당 리모델링 규제완화 수혜 기대.',
    refNote: '경기도청 판교3테크노밸리 사업계획 / 국토부 신분당선 연장 기본계획',
    naverSearch: '판교e편한세상삼평동',
  },
  {
    name: '백현마을 4~6단지',
    region: '성남시 분당구 백현동',
    area: 84,
    built: 2012,
    units: 2400,
    minP: 1_500_000_000,
    maxP: 1_800_000_000,
    reasons: ['판교역 생활권 5~10분, 학원가·알파돔 상업지구 인접', '2012~2013년 준공, 단지 커뮤니티 우수'],
    upside: '알파돔시티 2·3구역 상업개발 완성 시 판교 핵심 주거축 위상 강화. 백현동 카카오 본사타운 클러스터 직주근접 프리미엄.',
    refNote: '성남도시개발공사 알파돔시티 개발 현황 / 호갱노노 백현동 단지별 시세 추이',
    naverSearch: '백현마을4단지',
  },
];

function _calcMaxLoan({ propertyPrice, zone, ownershipStatus = 'none', annualIncome, existingAnnualDebt, loanRate = 0.037, termYears = 30 }) {
  const isRegulated = zone === 'overheated' || zone === 'regulated';

  // 규제지역 1주택자(처분조건 없음) → 대출 불가
  if (isRegulated && ownershipStatus === 'owned') {
    return { ltvRatio: 0, ltvLimitAmt: 0, dsrLimitAmt: 0, absoluteLimitAmt: null, maxLoan: 0, monthly: 0, isBlocked: true };
  }

  // 1. LTV 한도 (9.7 강화 + 10.15 대책 기준)
  let ltvRatio;
  if (!isRegulated) {
    // 비규제지역
    ltvRatio = ownershipStatus === 'first' ? 0.80 : 0.70;
  } else if (ownershipStatus === 'first') {
    ltvRatio = 0.80;                 // 생애최초: 80%
  } else if (ownershipStatus === 'dispose') {
    ltvRatio = 0.50;                 // 처분조건부 1주택자: 50%
  } else {
    ltvRatio = 0.40;                 // 무주택자: 40%
  }
  const ltvLimitAmt = Math.round(propertyPrice * ltvRatio);

  // 2. 10.15 대책 절대한도 (수도권·규제지역만 적용, 2025.10.16 계약자부터)
  let absoluteLimitAmt = null;
  if (isRegulated) {
    if (propertyPrice > 25e8)      absoluteLimitAmt = 2e8;   // 25억 초과 → 2억
    else if (propertyPrice > 15e8) absoluteLimitAmt = 4e8;   // 15억 초과 → 4억
    else                           absoluteLimitAmt = 6e8;   // 15억 이하 → 6억
  }

  // 3. DSR 40% 한도 — 연 소득 × 40% - 기존 연 원리금
  const maxAnnualNewPayment = annualIncome * 0.40 - existingAnnualDebt;
  let dsrLimitAmt = 0;
  if (maxAnnualNewPayment > 0) {
    const r = loanRate / 12;
    const n = termYears * 12;
    const pmt = r / (1 - Math.pow(1 + r, -n));
    dsrLimitAmt = Math.round((maxAnnualNewPayment / 12) / pmt);
  }

  const caps = [ltvLimitAmt, dsrLimitAmt, ...(absoluteLimitAmt !== null ? [absoluteLimitAmt] : [])];
  const maxLoan = Math.max(0, Math.min(...caps));
  const r = loanRate / 12, n = termYears * 12;
  const monthly = maxLoan > 0 ? Math.round(maxLoan * r / (1 - Math.pow(1 + r, -n))) : 0;

  return { ltvRatio, ltvLimitAmt, dsrLimitAmt, absoluteLimitAmt, maxLoan, monthly, isBlocked: false };
}

function _fmtAmt(n) {
  if (!n || n === 0) return '₩0';
  if (n >= 1e8) return `₩${(n / 1e8).toFixed(1)}억`;
  return `₩${Math.round(n / 10000).toLocaleString()}만`;
}

function _updateBudgetSubtotal(container) {
  let subtotal = 0;
  container.querySelectorAll('.budget-asset-chk').forEach(chk => {
    if (chk.checked) {
      const row = chk.closest('[data-amount]');
      subtotal += parseInt(row?.dataset.amount ?? '0') || 0;
    }
  });
  const extraCashEl = container.querySelector('#inp-extra-cash');
  subtotal += parseInt(extraCashEl?.value || '0') * 10000;
  const subEl = container.querySelector('#budget-subtotal');
  if (subEl) subEl.textContent = _fmtAmt(subtotal);
}

function _renderBudgetTab(container) {
  const budgetSt = storage.getReBudgetSettings();
  const ctx = _assetCtx ?? {};
  const settings = ctx.settings ?? {};
  const depositsData = ctx.depositsData ?? { items: [] };
  const spendingRecords = ctx.allSpendingRecords ?? [];
  const stocks = ctx.stocks ?? { kr: { total_value_krw: 0 }, us: { total_value_krw: 0 } };
  const goldValue = ctx.goldValue ?? 0;
  const upbitData = ctx.upbitData ?? {};

  // deposits 탭 체크박스 제외 항목 동기화
  const _iKey = (item) => `${item.owner}|${item.type}|${item.institution}|${item.amount}`;
  const excludedKeys = new Set(JSON.parse(localStorage.getItem('ad_deposits_excluded') || '[]'));
  const SKIP_TYPES = new Set(['코인', '비트코인', '비트코인(업비트)', '이더리움', '가상자산', '아파트', '금']);
  const knkDeposits = (depositsData.items ?? [])
    .filter(i => i.owner === '김노경' && !excludedKeys.has(_iKey(i)) && !SKIP_TYPES.has(i.type))
    .reduce((s, i) => s + (i.amount || 0), 0);
  const lchDeposits = (depositsData.items ?? [])
    .filter(i => i.owner === '이창헌' && !excludedKeys.has(_iKey(i)) && !SKIP_TYPES.has(i.type))
    .reduce((s, i) => s + (i.amount || 0), 0);

  // 아파트 가격 (시트 '아파트' 항목 또는 기본값 7억)
  const aptItem = (depositsData.items ?? []).find(i => i.type === '아파트');
  const aptValue = aptItem ? (aptItem.amount || 700_000_000) : 700_000_000;

  const stocksTotal = (stocks.kr?.total_value_krw ?? 0) + (stocks.us?.total_value_krw ?? 0);
  const upbitTotal = upbitData.totalEvalKrw ?? 0;
  const cryptoTotal = (ctx.crypto?.totalValueKrw ?? 0) + upbitTotal;

  // 잔여 개월 계산
  const today = new Date();
  let remainMonths = 0;
  if (budgetSt.purchaseDate) {
    const target = new Date(budgetSt.purchaseDate + '-01');
    remainMonths = Math.max(0, (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth()));
  }

  // 수동 지출 데이터로 평균 씨앗 계산 (데이터 있는 달 전부 활용, 최소 1개월)
  const _mExp = JSON.parse(localStorage.getItem('seed_monthly_expense') || '{}');
  const _KC = ['롯데카드', '하나복지', '고정비', '네이버', '기타'];
  const _LC = ['우리카드', '네이버', '보험료', '생활비', '기타'];
  const _sc = (obj, cats) => obj && typeof obj === 'object' ? cats.reduce((s, c) => s + (obj[c] || 0), 0) : 0;
  const _mTotal = ym => { const v = _mExp[ym]; return v ? _sc(v.knk, _KC) + _sc(v.lch, _LC) : 0; };
  const _mExtra = ym => (_mExp[ym]?.income?.knk || 0) + (_mExp[ym]?.income?.lch || 0);
  const _savedDet = JSON.parse(localStorage.getItem('seed_income_detail') || 'null');
  const _savedInc = parseInt(localStorage.getItem('seed_monthly_income') || '0');
  const _defInc = Math.round((settings.annualIncome ?? 0) / 12);
  const _knkM = (_savedDet?.knk?.salary || 0) * 10000;
  const _lchM = (_savedDet?.lch?.salary || 0) * 10000;
  const _monthlyInc = (_knkM + _lchM) > 0 ? (_knkM + _lchM) : (_savedInc || _defInc);
  const _m12 = Array.from({length: 12}, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (11 - i));
    return d.toISOString().slice(0, 7);
  });
  const _filled = _m12.filter(ym => _mTotal(ym) > 0);
  let avgSeed = 0;
  let seedDataMonths = 0;
  if (_filled.length > 0) {
    const total = _filled.reduce((s, ym) => s + Math.max(0, _monthlyInc + _mExtra(ym) - _mTotal(ym)), 0);
    avgSeed = Math.round(total / _filled.length);
    seedDataMonths = _filled.length;
  } else if (calcAvg3MonthSpending(spendingRecords) > 0) {
    avgSeed = Math.max(0, _monthlyInc - calcAvg3MonthSpending(spendingRecords));
    seedDataMonths = 3;
  }
  const seedProjection = avgSeed * remainMonths;

  // 선택된 자산 합산 (업비트 코인은 예금·적금 합산에 포함됨 → 별도 항목 제거)
  const sel = budgetSt.selectedAssets ?? {};
  const selectedTotal =
    (sel.knkDeposits ? knkDeposits : 0) +
    (sel.lchDeposits ? lchDeposits : 0) +
    (sel.apt !== false ? aptValue : 0) +
    (sel.stocks ? stocksTotal : 0) +
    (sel.gold ? goldValue : 0) +
    (parseInt(budgetSt.extraCash || 0) * 10000);

  // 대출 계산 — settings.annualIncome 없으면 씨앗모으기 월 실수령 × 12 자동 참조
  const _seedIncome = JSON.parse(localStorage.getItem('seed_income_detail') || 'null');
  const _seedMonthly = _seedIncome ? (((_seedIncome.knk?.salary || 0) + (_seedIncome.lch?.salary || 0)) * 10000) : 0;
  const annualIncome = (settings.annualIncome && settings.annualIncome > 0) ? settings.annualIncome : (_seedMonthly * 12);
  const existingAnnualDebt = ((settings.totalDebt ?? 0) > 0)
    ? (() => {
        const r = (budgetSt.loanRate ?? 3.7) / 100 / 12;
        const n = (budgetSt.loanTermYears ?? 30) * 12;
        return Math.round((settings.totalDebt ?? 0) * r / (1 - Math.pow(1 + r, -n)) * 12);
      })()
    : 0;
  // 억원 단위 마이그레이션 (구 만원 단위 → 억원 자동 변환)
  const targetPriceEok = budgetSt.targetPriceEok !== undefined
    ? parseFloat(budgetSt.targetPriceEok || 0)
    : parseInt(budgetSt.targetPrice || 0) / 10000;
  const loanResult = targetPriceEok > 0
    ? _calcMaxLoan({
        propertyPrice: Math.round(targetPriceEok * 1e8),
        zone: budgetSt.zone ?? 'overheated',
        ownershipStatus: budgetSt.ownershipStatus ?? (budgetSt.isFirstHome ? 'first' : 'none'),
        annualIncome,
        existingAnnualDebt,
        loanRate: (budgetSt.loanRate ?? 3.7) / 100,
        termYears: budgetSt.loanTermYears ?? 30,
      })
    : null;

  // 회사 대출: 구 companyLoan(만원) → 신 companyLoanEok(억원) 자동 마이그레이션
  const companyLoanEok = budgetSt.companyLoanEok !== undefined
    ? parseFloat(budgetSt.companyLoanEok || 0)
    : parseFloat(budgetSt.companyLoan || 0) / 10000;
  const companyLoan = companyLoanEok * 1e8;
  const maxLoan = loanResult?.maxLoan ?? 0;
  const totalBudget = selectedTotal + seedProjection + maxLoan + companyLoan;

  // 업비트 레이블
  const upbitLabel = upbitData.error
    ? `업비트 코인 <span class="text-red-400 text-[10px] font-normal">(연결 오류)</span>`
    : !upbitData.updatedAt
      ? '업비트 코인 <span class="text-gray-500 text-[10px] font-normal">(미연동)</span>'
      : '업비트 코인';

  // 추천 단지 필터링 (±30% 범위)
  const budgetMin = totalBudget * 0.60;
  const budgetMax = totalBudget * 1.15;
  const allComplexes = [...((_realestate?.complexes ?? []).map(c => ({
    name: c.name, region: c.region,
    minP: c.low12m ?? c.recentPrice * 0.9,
    maxP: c.high12m ?? c.recentPrice * 1.05,
    area: c.areaM2,
  }))), ...CURATED_APTS];

  const recommended = totalBudget > 0
    ? allComplexes.filter(a => a.minP <= budgetMax && a.maxP >= budgetMin)
        .sort((a, b) => a.minP - b.minP)
    : [];

  container.innerHTML = `
    <div class="space-y-5">

      <!-- 가용 자산 선택 -->
      <div class="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <h3 class="text-sm font-bold text-gray-700 mb-3">① 가용 자산 선택</h3>
        <div class="space-y-2" id="budget-asset-list">
          ${_assetCheckbox('sel-knk', '김노경 예금·적금 <span class="text-[10px] text-gray-400 font-normal">(deposits 탭 체크 연동)</span>', knkDeposits, sel.knkDeposits ?? true)}
          ${_assetCheckbox('sel-lch', '이창헌 예금·적금 <span class="text-[10px] text-gray-400 font-normal">(deposits 탭 체크 연동)</span>', lchDeposits, sel.lchDeposits ?? true)}
          ${_assetCheckbox('sel-apt', '아파트 (현재 거주)', aptValue, sel.apt !== false)}
          ${_assetCheckbox('sel-stocks', '주식 (국내+해외)', stocksTotal, sel.stocks ?? false)}
          ${_assetCheckbox('sel-gold', '금 (110돈)', goldValue, sel.gold ?? false)}
        </div>
        <div class="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
          <span class="text-xs text-gray-500 w-40">추가 현금 (기타 자금)</span>
          <input id="inp-extra-cash" type="number" min="0" value="${budgetSt.extraCash ?? 0}"
            class="w-24 text-right border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <span class="text-xs text-gray-500">만원</span>
        </div>
        <div class="mt-2 text-sm font-bold text-blue-700">소계: <span id="budget-subtotal">${_fmtAmt(selectedTotal)}</span></div>
      </div>

      <!-- 구매 예정 시점 + 씨앗 적립 -->
      <div class="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <h3 class="text-sm font-bold text-gray-700 mb-3">② 구매 예정 시점 & 씨앗 적립 예상</h3>
        <div class="flex items-center gap-3 mb-2">
          <span class="text-xs text-gray-500 w-28">구매 예정 시점</span>
          <input id="inp-purchase-date" type="month" value="${budgetSt.purchaseDate ?? ''}"
            style="color-scheme:light;color:#1f2937"
            class="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
          ${remainMonths > 0 ? `<span class="text-xs text-blue-600 font-bold">잔여 ${remainMonths}개월</span>` : ''}
        </div>
        <div class="grid grid-cols-3 gap-2 text-center mt-3">
          <div class="bg-white rounded-lg p-2 border border-gray-200">
            <div class="text-[10px] text-gray-400 mb-0.5">${seedDataMonths > 0 ? seedDataMonths + '개월' : ''} 평균 씨앗</div>
            <div class="text-sm font-bold ${avgSeed > 0 ? 'text-green-600' : 'text-gray-400'}">${avgSeed > 0 ? _fmtAmt(avgSeed) + '/월' : '데이터 없음'}</div>
          </div>
          <div class="bg-white rounded-lg p-2 border border-gray-200">
            <div class="text-[10px] text-gray-400 mb-0.5">잔여 기간</div>
            <div class="text-sm font-bold text-gray-700">${remainMonths}개월</div>
          </div>
          <div class="bg-white rounded-lg p-2 border border-gray-200">
            <div class="text-[10px] text-gray-400 mb-0.5">적립 예상</div>
            <div class="text-sm font-bold text-green-700">${_fmtAmt(seedProjection)}</div>
          </div>
        </div>
      </div>

      <!-- 대출 계산기 -->
      <div class="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <h3 class="text-sm font-bold text-gray-700 mb-3">③ 대출 가능액 계산</h3>
        <div class="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
          <div>
            <div class="text-[10px] text-gray-500 mb-1">매물 예상 가격 (억원)</div>
            <input id="inp-target-price" type="number" min="0" step="0.1"
              value="${targetPriceEok || ''}"
              placeholder="예: 16.5"
              class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <div class="text-[10px] text-gray-500 mb-1">지역 구분</div>
            <select id="inp-zone"
              class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="overheated" ${(budgetSt.zone ?? 'overheated') === 'overheated' ? 'selected' : ''}>투기과열지구 (서울 전역)</option>
              <option value="regulated" ${budgetSt.zone === 'regulated' ? 'selected' : ''}>조정대상지역 (경기·인천 일부)</option>
              <option value="free" ${budgetSt.zone === 'free' ? 'selected' : ''}>비규제지역</option>
            </select>
          </div>
          <div>
            <div class="text-[10px] text-gray-500 mb-1">대출 금리 (%)</div>
            <input id="inp-loan-rate" type="number" step="0.1" min="1" max="10"
              value="${budgetSt.loanRate ?? 3.7}"
              class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <div class="text-[10px] text-gray-500 mb-1">대출 기간 (년)</div>
            <input id="inp-loan-term" type="number" min="5" max="50"
              value="${budgetSt.loanTermYears ?? 30}"
              class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div class="col-span-2">
            <div class="text-[10px] text-gray-500 mb-1">주택 보유 현황 (10.15 대책 적용)</div>
            <select id="inp-ownership"
              class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
              ${(() => {
                const cur = budgetSt.ownershipStatus ?? (budgetSt.isFirstHome ? 'first' : 'none');
                return [
                  ['none',    '무주택자 (LTV 40%, 규제지역)'],
                  ['first',   '생애최초 구매 (LTV 80%)'],
                  ['dispose', '1주택자 — 처분조건부 (LTV 50%)'],
                  ['owned',   '1주택자 — 보유 중 (규제지역 대출불가)'],
                ].map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');
              })()}
            </select>
          </div>
          <div>
            <div class="text-[10px] text-gray-500 mb-1">연 소득 ${(settings.annualIncome && settings.annualIncome > 0) ? '(설정)' : '(씨앗모으기 연동)'}</div>
            <div class="text-xs font-bold text-gray-700 py-1">${_fmtAmt(annualIncome)}</div>
          </div>
          <div>
            <div class="text-[10px] text-gray-500 mb-1">기존 부채 잔액 (설정에서 자동)</div>
            <div class="text-xs font-bold text-gray-700 py-1">${_fmtAmt(settings.totalDebt ?? 0)}</div>
          </div>
        </div>

        ${loanResult ? (loanResult.isBlocked ? `
          <div class="bg-red-50 rounded-lg p-3 border border-red-200 mt-2 text-center">
            <div class="text-sm font-bold text-red-600">⚠️ 대출 불가</div>
            <div class="text-xs text-red-500 mt-1">규제지역 1주택자는 추가 주담대 불가 (10.15 대책)</div>
          </div>` : `
          <div class="bg-white rounded-lg p-3 border border-blue-200 mt-2">
            <div class="grid grid-cols-3 gap-2 text-center mb-2">
              <div>
                <div class="text-[10px] text-gray-400">LTV 한도 (${Math.round(loanResult.ltvRatio * 100)}%)</div>
                <div class="text-sm font-bold text-blue-700">${_fmtAmt(loanResult.ltvLimitAmt)}</div>
              </div>
              <div>
                <div class="text-[10px] text-gray-400">10.15 절대한도</div>
                <div class="text-sm font-bold text-orange-600">${loanResult.absoluteLimitAmt ? _fmtAmt(loanResult.absoluteLimitAmt) : '제한없음'}</div>
              </div>
              <div>
                <div class="text-[10px] text-gray-400">DSR 40% 한도</div>
                <div class="text-sm font-bold text-purple-700">${loanResult.dsrLimitAmt > 0 ? _fmtAmt(loanResult.dsrLimitAmt) : '소득 부족'}</div>
              </div>
            </div>
            <div class="text-center border-t border-gray-100 pt-2 mt-1">
              <div class="text-[10px] text-gray-400 mb-0.5">최대 대출 가능 (3가지 중 최솟값)</div>
              <div class="text-base font-bold text-green-700">${_fmtAmt(loanResult.maxLoan)}</div>
            </div>
            <div class="text-center text-xs text-gray-500 mt-1">
              예상 월 상환액: <strong class="text-gray-700">${Math.round(loanResult.monthly / 10000).toLocaleString()}만원</strong>
              (${budgetSt.loanRate ?? 3.7}% 고정, ${budgetSt.loanTermYears ?? 30}년 원리금균등)
            </div>
          </div>`) : `
          <div class="text-xs text-gray-400 text-center py-2">매물 예상 가격을 입력하면 대출 가능액이 계산됩니다</div>`}
      </div>

      <!-- 회사 대출 -->
      <div class="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <h3 class="text-sm font-bold text-gray-700 mb-2">④ 회사/기타 대출 (수동 입력)</h3>
        <div class="flex items-center gap-2">
          <input id="inp-company-loan" type="number" min="0" step="0.1" value="${companyLoanEok}"
            class="w-28 text-right border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <span class="text-xs text-gray-500">억원</span>
          <span class="text-xs text-gray-400 ml-2">(회사 대출, 가족 지원금 등 포함)</span>
        </div>
      </div>

      <!-- 총 투자 가능 금액 -->
      <div class="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-5 text-white">
        <div class="text-sm font-bold mb-3">💰 부동산 투자 가능 최대 금액</div>
        <div class="text-3xl font-bold mb-3">${_fmtAmt(totalBudget)}</div>
        <div class="grid grid-cols-2 gap-1 text-xs text-blue-100">
          <span>• 가용 자산: ${_fmtAmt(selectedTotal)}</span>
          <span>• 씨앗 적립 예상: ${_fmtAmt(seedProjection)}</span>
          <span>• 주택담보대출: ${_fmtAmt(maxLoan)}</span>
          <span>• 회사/기타 대출: ${_fmtAmt(companyLoan)}</span>
        </div>
        <button id="btn-save-budget"
          class="mt-4 w-full bg-white text-blue-700 hover:bg-blue-50 rounded-lg py-2 text-sm font-bold transition-colors">
          설정 저장 후 재계산
        </button>
      </div>

      <!-- 추천 단지 (16~18억 타겟, 허용 지역 한정) -->
      <div>
        <h3 class="text-sm font-bold text-gray-700 mb-1">🏠 16~18억 목표 추천 단지</h3>
        <p class="text-xs text-gray-400 mb-2">마포·용산·서초·강남·송파·분당구 한정 · 84㎡ 기준</p>
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-[11px] text-amber-800 space-y-1">
          <div class="font-semibold">⚠ 가격 출처 및 한계 안내</div>
          <div>아래 가격은 <b>2026년 5월 기준 호갱노노·아실 조회 데이터를 참고한 수동 추정치</b>입니다. 실제 호가·실거래가와 다를 수 있습니다.</div>
          <div>국토부 실거래가 API는 공공데이터포털(data.go.kr)에서 무료 제공되나 <b>계약일 기준 60일 이후 등록</b>으로 시세 파악에 한계가 있습니다. 네이버 부동산 API는 <b>비공개 상업 API</b>로 직접 연동 불가합니다.</div>
          <div class="font-semibold">👉 실시간 시세 확인: <a href="https://hogangnono.com" target="_blank" class="underline text-blue-700">호갱노노</a> · <a href="https://asil.kr" target="_blank" class="underline text-blue-700">아실</a> · <a href="https://new.land.naver.com" target="_blank" class="underline text-blue-700">네이버부동산</a></div>
        </div>
        ${totalBudget > 0 ? `<p class="text-xs text-blue-600 mb-3">현재 예산 ${_fmtAmt(totalBudget)} 기준 — 각 단지 가격 대비 잔여 확인</p>` : ''}
        <div class="space-y-3">
          ${CURATED_APTS.map(a => {
            const midP = (a.minP + a.maxP) / 2;
            const gap = totalBudget > 0 ? totalBudget - midP : null;
            const gapColor = gap === null ? 'text-gray-400' : gap >= 0 ? 'text-green-600' : 'text-red-500';
            const gapText = gap === null ? '예산 미입력' : gap >= 0 ? `예산 ${_fmtAmt(gap)} 여유` : `예산 ${_fmtAmt(Math.abs(gap))} 부족`;
            return `
              <div class="rounded-xl border ${gap !== null && gap < 0 ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'} p-4">
                <div class="flex items-start justify-between mb-2">
                  <div>
                    <div class="text-sm font-bold text-gray-800">${a.name}</div>
                    <div class="text-xs text-gray-500">${a.region} · 전용 ${a.area}㎡ (약 ${Math.round(a.area / 3.3058)}평)${a.built ? ` · ${a.built}년 준공` : ''}${a.units ? ` · ${a.units.toLocaleString()}세대` : ''}</div>
                  </div>
                  <div class="text-right ml-3 shrink-0">
                    <div class="text-xs text-gray-400">84㎡ 추정 시세</div>
                    <div class="text-sm font-bold text-gray-700">${_fmtAmt(a.minP)} ~ ${_fmtAmt(a.maxP)}</div>
                    <div class="text-xs font-semibold mt-0.5 ${gapColor}">${gapText}</div>
                  </div>
                </div>
                <div class="mb-2">
                  <div class="text-[11px] font-semibold text-gray-600 mb-1">추천 이유</div>
                  <ul class="space-y-0.5">
                    ${a.reasons.map(r => `<li class="text-[11px] text-gray-600">• ${r}</li>`).join('')}
                  </ul>
                </div>
                <div class="bg-white/70 rounded-lg p-2 mb-1">
                  <div class="text-[11px] font-semibold text-blue-700 mb-0.5">📈 투자 Upside</div>
                  <p class="text-[11px] text-gray-600">${a.upside}</p>
                </div>
                <div class="bg-amber-50 rounded-lg px-2 py-1.5 mb-1 flex items-start gap-1.5">
                  <span class="text-[11px]">🔍</span>
                  <div>
                    <span class="text-[11px] font-semibold text-amber-700">실시간 매물 확인: </span>
                    <span class="text-[11px] text-gray-600">네이버부동산에서 "${a.naverSearch}" 검색 → 해당 단지 → 매물 탭에서 층별·향별 실제 호가 확인 (가격은 추정치이므로 반드시 확인)</span>
                  </div>
                </div>
                <div class="text-[10px] text-gray-400">📎 ${a.refNote}</div>
              </div>`;
          }).join('')}
        </div>
        <p class="text-[10px] text-gray-400 mt-3">서초구·강남구는 현재 16~18억 예산으로 진입이 어렵습니다 (반포·대치 등 최저 20억대 이상).</p>
      </div>

    </div>`;

  // 체크박스 reactive 업데이트 (Fix 6)
  container.querySelectorAll('.budget-asset-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const row = chk.closest('[data-amount]');
      const amount = parseInt(row?.dataset.amount ?? '0') || 0;
      const amtEl = container.querySelector(`#${chk.id}-amt`);
      if (amtEl) amtEl.textContent = chk.checked ? _fmtAmt(amount) : '₩0';
      _updateBudgetSubtotal(container);
    });
  });

  // 추가 현금 변경 시 소계 업데이트
  container.querySelector('#inp-extra-cash')?.addEventListener('input', () => _updateBudgetSubtotal(container));

  // 저장 버튼
  container.querySelector('#btn-save-budget')?.addEventListener('click', () => {
    storage.setReBudgetSettings({
      purchaseDate: container.querySelector('#inp-purchase-date')?.value ?? '',
      companyLoanEok: parseFloat(container.querySelector('#inp-company-loan')?.value || '0'),
      extraCash: parseInt(container.querySelector('#inp-extra-cash')?.value || '0'),
      selectedAssets: {
        knkDeposits: container.querySelector('#sel-knk')?.checked ?? true,
        lchDeposits: container.querySelector('#sel-lch')?.checked ?? true,
        apt: container.querySelector('#sel-apt')?.checked ?? true,
        stocks: container.querySelector('#sel-stocks')?.checked ?? false,
        gold: container.querySelector('#sel-gold')?.checked ?? false,
      },
      ownershipStatus: container.querySelector('#inp-ownership')?.value ?? 'none',
      zone: container.querySelector('#inp-zone')?.value ?? 'overheated',
      targetPriceEok: parseFloat(container.querySelector('#inp-target-price')?.value || '0'),
      loanRate: parseFloat(container.querySelector('#inp-loan-rate')?.value || '3.7'),
      loanTermYears: parseInt(container.querySelector('#inp-loan-term')?.value || '30'),
    });
    _renderInline(_inlineReContainerId);
  });
}

function _assetCheckbox(id, label, amount, checked) {
  return `
    <div class="flex items-center gap-3" data-amount="${amount}">
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}
        class="budget-asset-chk w-3.5 h-3.5 accent-blue-500 cursor-pointer" />
      <span class="text-xs text-gray-600 flex-1">${label}</span>
      <span id="${id}-amt" class="text-xs font-bold text-gray-800">${checked ? _fmtAmt(amount) : '₩0'}</span>
    </div>`;
}
