import { parseTossAssetCsv, parseTossSpendingCsv } from '../js/csv-parser.js';

describe('parseTossAssetCsv', () => {
  test('예금·적금·현금 항목 합산', () => {
    const csv = `자산명,종류,금액
국민은행 보통예금,현금·예금,5000000
신한 정기예금,예금,20000000
카카오뱅크 적금,적금,10000000
삼성전자,주식,7200000`;
    const r = parseTossAssetCsv(csv);
    expect(r.cash).toBe(5000000);
    expect(r.deposits).toBe(20000000);
    expect(r.savings).toBe(10000000);
  });

  test('쉼표 포함 금액 파싱', () => {
    const csv = `자산명,종류,금액\n국민은행,예금,"50,000,000"`;
    const r = parseTossAssetCsv(csv);
    expect(r.deposits).toBe(50000000);
  });
});

describe('parseTossSpendingCsv', () => {
  test('지출(음수)만 파싱, 수입(양수) 제외', () => {
    const csv = `날짜,내용,금액,카테고리
2026-05-01,스타벅스,-6000,식비
2026-05-02,지하철,-1500,교통
2026-05-03,급여,3000000,`;
    const r = parseTossSpendingCsv(csv);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ date: '2026-05-01', amount: 6000, category: '식비', memo: '스타벅스' });
    expect(r[1].amount).toBe(1500);
  });

  test('카테고리 없으면 기타', () => {
    const csv = `날짜,내용,금액,카테고리\n2026-05-01,ATM출금,-30000,`;
    const r = parseTossSpendingCsv(csv);
    expect(r[0].category).toBe('기타');
  });
});
