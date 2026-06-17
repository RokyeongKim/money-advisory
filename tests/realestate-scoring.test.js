import {
  scoreCommute, scoreRating, scoreTransit, scoreDevelopment,
  scorePrice, scoreSupply, calcComplexScore, rankComplexes,
  PRESETS, CRITERIA,
} from '../js/realestate-scoring.js';

describe('scoreCommute', () => {
  test('10분 이하 → 100점', () => expect(scoreCommute(5)).toBe(100));
  test('60분 이상 → 0점', () => expect(scoreCommute(70)).toBe(0));
  test('35분 → 50점', () => expect(scoreCommute(35)).toBe(50));
  test('10분 정확히 → 100점', () => expect(scoreCommute(10)).toBe(100));
  test('60분 정확히 → 0점', () => expect(scoreCommute(60)).toBe(0));
});

describe('scoreRating', () => {
  test('5점 → 100', () => expect(scoreRating(5)).toBe(100));
  test('1점 → 0', () => expect(scoreRating(1)).toBe(0));
  test('3점 → 50', () => expect(scoreRating(3)).toBe(50));
});

describe('scoreTransit', () => {
  test('3개 이상 → 100', () => expect(scoreTransit(4)).toBe(100));
  test('2개 → 70', () => expect(scoreTransit(2)).toBe(70));
  test('1개 → 40', () => expect(scoreTransit(1)).toBe(40));
  test('0개 → 0', () => expect(scoreTransit(0)).toBe(0));
});

describe('scoreDevelopment', () => {
  test('0점 → 0', () => expect(scoreDevelopment(0)).toBe(0));
  test('20점 이상 → 100', () => expect(scoreDevelopment(25)).toBe(100));
  test('10점 → 50', () => expect(scoreDevelopment(10)).toBe(50));
});

describe('scorePrice', () => {
  test('지역 중간값의 85% 이하 → 100', () => {
    const complexes = [{ recentPrice: 1000000000 }, { recentPrice: 1000000000 }];
    expect(scorePrice(840000000, complexes)).toBe(100);
  });
  test('지역 중간값의 125% 이상 → 0', () => {
    const complexes = [{ recentPrice: 1000000000 }, { recentPrice: 1000000000 }];
    expect(scorePrice(1300000000, complexes)).toBe(0);
  });
  test('complexes 빈 배열 → 50', () => {
    expect(scorePrice(1000000000, [])).toBe(50);
  });
});

describe('scoreSupply', () => {
  test('100세대 이하 → 100', () => expect(scoreSupply(50)).toBe(100));
  test('3000세대 이상 → 0', () => expect(scoreSupply(4000)).toBe(0));
  test('0세대 → 100', () => expect(scoreSupply(0)).toBe(100));
});

describe('calcComplexScore', () => {
  test('모든 기준 100점 + 합계 100 가중치 → 100점', () => {
    const rawScores = Object.fromEntries(CRITERIA.map(k => [k, 100]));
    expect(calcComplexScore(rawScores, PRESETS.residential)).toBe(100);
  });
  test('모든 기준 0점 → 0점', () => {
    const rawScores = Object.fromEntries(CRITERIA.map(k => [k, 0]));
    expect(calcComplexScore(rawScores, PRESETS.residential)).toBe(0);
  });
  test('누락 기준은 0으로 처리', () => {
    expect(calcComplexScore({}, PRESETS.residential)).toBe(0);
  });
});

describe('rankComplexes', () => {
  test('totalScore 내림차순 정렬', () => {
    const input = [{ totalScore: 70 }, { totalScore: 85 }, { totalScore: 60 }];
    expect(rankComplexes(input).map(c => c.totalScore)).toEqual([85, 70, 60]);
  });
  test('원본 배열 변경 없음', () => {
    const input = [{ totalScore: 70 }, { totalScore: 85 }];
    rankComplexes(input);
    expect(input[0].totalScore).toBe(70);
  });
});

describe('PRESETS 가중치 합계', () => {
  Object.entries(PRESETS).forEach(([name, weights]) => {
    test(`${name} 합계 = 100`, () => {
      expect(Object.values(weights).reduce((s, v) => s + v, 0)).toBe(100);
    });
  });
});
