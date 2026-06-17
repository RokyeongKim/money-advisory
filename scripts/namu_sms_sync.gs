/**
 * 나무증권(NH투자증권) 체결 SMS → portfolio.json + trade_history.json 자동 동기화
 *
 * ─── 1회 초기 설정 ───────────────────────────────────────────────────────────
 * 1. script.google.com → 새 프로젝트 → 이 파일 전체 붙여넣기
 * 2. 프로젝트 설정(⚙️) → 스크립트 속성 → 추가:
 *      GITHUB_TOKEN  :  ghp_xxxx  (github.com/settings/tokens → repo 권한)
 * 3. setupAll() 함수 선택 → ▶ 실행 (트리거 등록 + Gmail 필터 생성)
 * 4. Android에 "SMS Forwarder" 앱(Frex 개발) 설치:
 *      Sender contains: NH투자증권
 *      Forward to:      junsun8k@gmail.com
 *      Include body:    ON
 *
 * ─── 이후 완전 자동 ──────────────────────────────────────────────────────────
 * - 체결 SMS → Gmail → 5분 내 portfolio.json + data/trade_history.json 반영
 * - 신규 종목 종목명 자동 조회 (Naver Finance API)
 * - 중복 처리 방지 (messageId 기반 dedup)
 * - 오류 시 junsun8k@gmail.com으로 에러 메일 발송
 */

// ─── 설정 (변경 불필요) ───────────────────────────────────────────────────────
const CFG = {
  OWNER:      'RokyeongKim',
  REPO:       'asset-dashboard',
  BRANCH:     'master',
  PORTFOLIO:  'portfolio.json',
  HISTORY:    'data/trade_history.json',
  ALERT_EMAIL: 'junsun8k@gmail.com',
  GMAIL_QUERY: '"NH투자증권" "체결종류" is:unread',
  DEDUP_KEY:  'PROCESSED_MSG_IDS',
  DEDUP_MAX:  200,           // 최근 N개 처리된 messageId 보관
};

// ─── 메인: 5분 트리거로 실행 ───────────────────────────────────────────────
function processNamuTrades() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) { _alert('GITHUB_TOKEN 미설정'); return; }

  const threads = GmailApp.search(CFG.GMAIL_QUERY, 0, 20);
  if (!threads.length) return;

  const processedIds = _getProcessedIds();
  const newTrades = [];

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      if (!msg.isUnread()) continue;
      const msgId = msg.getId();

      // 중복 방지
      if (processedIds.has(msgId)) { msg.markRead(); continue; }

      const body = msg.getPlainBody();
      const parsed = parseTrade(body);
      if (parsed) {
        newTrades.push({ parsed, msgId });
      } else {
        Logger.log(`⚠️ 파싱 실패 (${msgId}): ${body.substring(0, 80)}`);
      }
      msg.markRead();
    }
  }

  if (!newTrades.length) return;

  try {
    // GitHub에서 두 파일 동시 읽기
    const [pfResult, histResult] = [
      _ghRead(token, CFG.PORTFOLIO),
      _ghRead(token, CFG.HISTORY),
    ];
    const portfolio = JSON.parse(pfResult.content);
    const history   = JSON.parse(histResult.content);

    const log = [];

    for (const { parsed, msgId } of newTrades) {
      // 신규 종목이면 종목명 자동 조회
      if (parsed.name === '' || parsed.name === `(${parsed.code})`) {
        parsed.name = _fetchStockName(parsed.code) || parsed.code;
      }

      // 1) portfolio.json 업데이트
      const tradeRecord = _applyToPortfolio(portfolio, parsed);
      log.push(tradeRecord.desc);

      // 2) trade_history.json에 이력 추가
      history.unshift({
        id:              msgId,
        date:            tradeRecord.date,
        ticker:          parsed.code,
        name:            parsed.name,
        type:            parsed.type,
        qty:             parsed.qty,
        price:           parsed.price,
        total:           parsed.price * parsed.qty,
        avgCostAtTrade:  tradeRecord.avgCostAtTrade,
        realizedPnL:     tradeRecord.realizedPnL,
        source:          'SMS',
      });

      // 처리 완료 ID 등록
      processedIds.add(msgId);
    }

    // GitHub push (두 파일)
    const commitMsg = `[자동] 나무증권 체결: ${log.join(' / ')}`;
    _ghWrite(token, CFG.PORTFOLIO, JSON.stringify(portfolio, null, 2), pfResult.sha, commitMsg);
    _ghWrite(token, CFG.HISTORY,   JSON.stringify(history,   null, 2), histResult.sha, commitMsg);

    // 처리 ID 저장
    _saveProcessedIds(processedIds);

    Logger.log(`✅ ${commitMsg}`);
  } catch (e) {
    _alert(`처리 오류: ${e.message}`);
    Logger.log(`❌ ${e.message}`);
  }
}

// ─── SMS 파싱 ──────────────────────────────────────────────────────────────
function parseTrade(text) {
  const nameMatch  = text.match(/종\s*목\s*명\s*:\s*(.+)/);
  const codeMatch  = text.match(/종목코드\s*:\s*(\d{6})/);
  const typeMatch  = text.match(/체결종류\s*:\s*(매수|매도)/);
  const qtyMatch   = text.match(/체결수량\s*:\s*([\d,]+)주/);
  const priceMatch = text.match(/체결단가\s*:\s*([\d,]+)원/);

  if (!codeMatch || !typeMatch || !qtyMatch || !priceMatch) return null;

  return {
    code:  codeMatch[1].trim(),
    name:  nameMatch ? nameMatch[1].trim() : '',
    type:  typeMatch[1],
    qty:   parseInt(qtyMatch[1].replace(/,/g, '')),
    price: parseInt(priceMatch[1].replace(/,/g, '')),
  };
}

// ─── portfolio.json 업데이트 + 손익 계산 ──────────────────────────────────
function _applyToPortfolio(portfolio, { code, name, type, qty, price }) {
  const list = portfolio.stocks_kr;
  const idx  = list.findIndex(s => s.ticker === code);
  const now  = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');

  let avgCostAtTrade = price;
  let realizedPnL    = null;
  let desc           = '';

  if (type === '매수') {
    if (idx >= 0) {
      const prev        = list[idx];
      avgCostAtTrade    = prev.avg_price_krw;
      const totalCost   = prev.avg_price_krw * prev.shares + price * qty;
      const totalShares = prev.shares + qty;
      prev.avg_price_krw = Math.round(totalCost / totalShares);
      prev.shares        = totalShares;
      desc = `${prev.name} 추가매수 ${qty}주 (평균단가→${prev.avg_price_krw.toLocaleString()}원, 총${totalShares}주)`;
    } else {
      list.push({ ticker: code, name, shares: qty, avg_price_krw: price });
      desc = `${name} 신규매수 ${qty}주 @${price.toLocaleString()}원`;
    }
  } else {
    if (idx >= 0) {
      avgCostAtTrade = list[idx].avg_price_krw;
      realizedPnL    = (price - avgCostAtTrade) * qty;
      const stockName = list[idx].name;
      list[idx].shares = Math.max(0, list[idx].shares - qty);
      const remain = list[idx].shares;
      if (remain === 0) list.splice(idx, 1);
      const pnlSign = realizedPnL >= 0 ? '+' : '';
      desc = `${stockName} 매도 ${qty}주 @${price.toLocaleString()}원 (손익 ${pnlSign}${Math.round(realizedPnL / 10000).toLocaleString()}만, 잔여 ${remain}주)`;
    } else {
      desc = `${code} 매도 시도 — 미보유 종목 (무시)`;
    }
  }

  return { desc, date: now, avgCostAtTrade, realizedPnL };
}

// ─── Naver Finance API: 종목명 자동 조회 ──────────────────────────────────
function _fetchStockName(code) {
  try {
    const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
    const res = UrlFetchApp.fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      return data.stockName || data.name || null;
    }
  } catch (_) {}
  return null;
}

// ─── GitHub API ────────────────────────────────────────────────────────────
function _ghRead(token, path) {
  const url = `https://api.github.com/repos/${CFG.OWNER}/${CFG.REPO}/contents/${path}?ref=${CFG.BRANCH}`;
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() === 404) {
    // 파일이 없으면 빈 배열로 초기화
    return { content: '[]', sha: null };
  }
  const data = JSON.parse(res.getContentText());
  if (!data.content) throw new Error(`GitHub 읽기 실패 (${path}): ${res.getResponseCode()}`);
  return {
    content: Utilities.newBlob(Utilities.base64Decode(data.content.replace(/\n/g, ''))).getDataAsString('UTF-8'),
    sha:     data.sha,
  };
}

function _ghWrite(token, path, content, sha, message) {
  const url  = `https://api.github.com/repos/${CFG.OWNER}/${CFG.REPO}/contents/${path}`;
  const body = { message, content: Utilities.base64Encode(content, 'UTF-8'), branch: CFG.BRANCH };
  if (sha) body.sha = sha;
  const res = UrlFetchApp.fetch(url, {
    method:  'put',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  if (![200, 201].includes(res.getResponseCode())) {
    throw new Error(`GitHub 쓰기 실패 (${path} ${res.getResponseCode()}): ${res.getContentText().substring(0, 200)}`);
  }
}

// ─── 중복 방지: 처리된 messageId 관리 ────────────────────────────────────
function _getProcessedIds() {
  const raw = PropertiesService.getScriptProperties().getProperty(CFG.DEDUP_KEY) || '[]';
  return new Set(JSON.parse(raw));
}

function _saveProcessedIds(idSet) {
  // 최신 N개만 유지
  const arr = Array.from(idSet).slice(-CFG.DEDUP_MAX);
  PropertiesService.getScriptProperties().setProperty(CFG.DEDUP_KEY, JSON.stringify(arr));
}

// ─── 에러 알림 ────────────────────────────────────────────────────────────
function _alert(msg) {
  try {
    GmailApp.sendEmail(CFG.ALERT_EMAIL, `[나무증권 자동화 오류] ${msg}`, msg);
  } catch (_) {}
}

// ─── 초기 설정: 1회만 실행 ────────────────────────────────────────────────
function setupAll() {
  // 5분 트리거 등록
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processNamuTrades')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processNamuTrades').timeBased().everyMinutes(5).create();

  Logger.log('✅ 5분 트리거 등록 완료');
  Logger.log('📋 남은 설정: Android SMS Forwarder 앱에서 NH투자증권 → junsun8k@gmail.com 포워딩 설정');
  Logger.log('📋 GITHUB_TOKEN이 스크립트 속성에 있는지 확인하세요');
}

// ─── 수동 테스트: 실제 SMS 텍스트로 파싱 확인 ────────────────────────────
function testParse() {
  const sampleSms = `[NH투자증권] 매도 주문체결 알림

종 목 명 : 삼성SDI
종목코드 : 006400
체결종류 : 매도 전량체결
체결수량 : 3주
체결단가 : 645,000원
주문번호 : 0006694449`;

  const result = parseTrade(sampleSms);
  Logger.log(JSON.stringify(result));
  // 예상 출력: {"code":"006400","name":"삼성SDI","type":"매도","qty":3,"price":645000}
}
