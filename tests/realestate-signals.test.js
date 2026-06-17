import {
  calcSignalScore, calcRegionTotalScore, rankRegionsBySignals,
  getBadge, getSignalStageName, SIGNAL_TYPES,
} from '../js/realestate-signals.js';

describe('calcSignalScore', () => {
  test('stageIndex 0 → 1점', () => expect(calcSignalScore({ stageIndex: 0 })).toBe(1));
  test('stageIndex 4 → 5점 (재건축 최대)', () => expect(calcSignalScore({ stageIndex: 4 })).toBe(5));
  test('stageIndex 2 → 3점', () => expect(calcSignalScore({ stageIndex: 2 })).toBe(3));
});

describe('calcRegionTotalScore', () => {
  test('빈 배열 → 0', () => expect(calcRegionTotalScore([])).toBe(0));
  test('단일 시그널 합산', () => {
    expect(calcRegionTotalScore([{ stageIndex: 3 }])).toBe(4);
  });
  test('복수 시그널 합산', () => {
    const signals = [{ stageIndex: 3 }, { stageIndex: 1 }];
    expect(calcRegionTotalScore(signals)).toBe(6);
  });
});

describe('rankRegionsBySignals', () => {
  test('총점 내림차순', () => {
    const regions = [
      { id: 'a', signals: [{ stageIndex: 0 }] },
      { id: 'b', signals: [{ stageIndex: 4 }] },
    ];
    expect(rankRegionsBySignals(regions)[0].id).toBe('b');
  });
  test('totalScore 필드 추가', () => {
    const regions = [{ id: 'a', signals: [{ stageIndex: 2 }] }];
    expect(rankRegionsBySignals(regions)[0].totalScore).toBe(3);
  });
  test('원본 배열 변경 없음', () => {
    const regions = [{ id: 'a', signals: [] }];
    rankRegionsBySignals(regions);
    expect(regions[0].totalScore).toBeUndefined();
  });
});

describe('getBadge', () => {
  test('stageIndex 2, maxStage 5 → ●●●○○', () => expect(getBadge(2, 5)).toBe('●●●○○'));
  test('stageIndex 0, maxStage 3 → ●○○', () => expect(getBadge(0, 3)).toBe('●○○'));
  test('stageIndex 3, maxStage 4 → ●●●●', () => expect(getBadge(3, 4)).toBe('●●●●'));
});

describe('getSignalStageName', () => {
  test('reconstruction stageIndex 0 → 추진위설립', () =>
    expect(getSignalStageName({ type: 'reconstruction', stageIndex: 0 })).toBe('추진위설립'));
  test('transit stageIndex 2 → 착공', () =>
    expect(getSignalStageName({ type: 'transit', stageIndex: 2 })).toBe('착공'));
  test('알 수 없는 타입 → 알 수 없음', () =>
    expect(getSignalStageName({ type: 'unknown', stageIndex: 0 })).toBe('알 수 없음'));
});

describe('SIGNAL_TYPES 구조', () => {
  test('모든 타입에 maxStage, label, stages 존재', () => {
    Object.entries(SIGNAL_TYPES).forEach(([key, val]) => {
      expect(val).toHaveProperty('maxStage');
      expect(val).toHaveProperty('label');
      expect(val).toHaveProperty('stages');
      expect(val.stages.length).toBe(val.maxStage);
    });
  });
});
