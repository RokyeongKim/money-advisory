function parseRows(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    values.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

const ASSET_TYPE_MAP = {
  '현금·예금': 'cash',
  '예금': 'deposits',
  '적금': 'savings',
};

export function parseTossAssetCsv(csvText) {
  const rows = parseRows(csvText);
  const result = { cash: 0, deposits: 0, savings: 0 };
  for (const row of rows) {
    const type = ASSET_TYPE_MAP[row['종류']];
    if (!type) continue;
    const amount = parseInt(row['금액'].replace(/,/g, ''), 10);
    if (!isNaN(amount)) result[type] += amount;
  }
  return result;
}

export function parseTossSpendingCsv(csvText) {
  const rows = parseRows(csvText);
  return rows
    .filter(row => parseInt(row['금액'].replace(/,/g, ''), 10) < 0)
    .map(row => ({
      date: row['날짜'],
      amount: Math.abs(parseInt(row['금액'].replace(/,/g, ''), 10)),
      category: row['카테고리'] || '기타',
      memo: row['내용'] || '',
    }));
}

/**
 * NH투자증권 잔고 CSV 파싱
 * 예상 컬럼: 종목명, 종목코드, 보유수량, 평균단가, 현재가, 평가금액, ...
 * 컬럼명이 다를 경우 유사 키로 fallback
 */
export function parseNhHoldingsCsv(csvText) {
  const rows = parseRows(csvText).filter(r => Object.values(r).some(v => v));
  const holdings = {};
  for (const row of rows) {
    const name =
      row['종목명'] ?? row['종목 명'] ?? row['상품명'] ?? '';
    const avgPrice =
      parseNum(row['평균단가'] ?? row['매입단가'] ?? row['평균매입단가'] ?? '0');
    const quantity =
      parseNum(row['보유수량'] ?? row['수량'] ?? row['잔고수량'] ?? '0');
    if (!name || avgPrice <= 0 || quantity <= 0) continue;
    holdings[name.trim()] = { avgPrice, quantity };
  }
  return holdings;
}

function parseNum(str) {
  return parseInt((str ?? '').toString().replace(/,/g, '').trim(), 10) || 0;
}
