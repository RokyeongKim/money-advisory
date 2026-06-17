export const CRITERIA = ['commute', 'school', 'transit', 'development', 'commercial', 'price', 'supply', 'infra', 'forest'];

export const PRESETS = {
  residential:   { commute: 15, school: 25, transit: 20, development: 15, commercial: 10, price: 8,  supply: 4, infra: 1, forest: 2 },
  investment:    { commute: 10, school: 5,  transit: 15, development: 30, commercial: 20, price: 15, supply: 3, infra: 1, forest: 1 },
  commute_first: { commute: 35, school: 10, transit: 30, development: 10, commercial: 5,  price: 6,  supply: 2, infra: 1, forest: 1 },
};

export const PRESET_LABELS = {
  residential: '실거주 중심',
  investment: '투자 수익 중심',
  commute_first: '직주근접 중심',
};

export const CRITERIA_LABELS = {
  commute: '직주근접', school: '학군', transit: '교통',
  development: '개발호재', commercial: '상권', price: '가격수준',
  supply: '신규공급', infra: '환경/인프라', forest: '숲세권',
};

// 통근 시간(분) → 0-100 (10분 이하=100, 60분 이상=0, 선형)
export function scoreCommute(minutes) {
  if (minutes <= 10) return 100;
  if (minutes >= 60) return 0;
  return Math.round(100 - (minutes - 10) * 2);
}

// 1-5점 평점 → 0-100
export function scoreRating(rating) {
  return Math.round(((rating - 1) / 4) * 100);
}

// 도보 10분 내 지하철역 수 → 0-100
export function scoreTransit(stationCount) {
  if (stationCount >= 3) return 100;
  if (stationCount === 2) return 70;
  if (stationCount === 1) return 40;
  return 0;
}

// 시그널 총점 → 0-100 (20점을 최대로 간주)
export function scoreDevelopment(signalTotalScore) {
  return Math.min(100, Math.round((signalTotalScore / 20) * 100));
}

// 현재가 vs 지역 중간값 비교 → 0-100 (저렴할수록 높음)
export function scorePrice(recentPrice, regionComplexes) {
  const prices = regionComplexes.map(c => c.recentPrice).filter(Boolean);
  if (!prices.length) return 50;
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const ratio = recentPrice / median;
  if (ratio <= 0.85) return 100;
  if (ratio >= 1.25) return 0;
  return Math.round((1.25 - ratio) / 0.4 * 100);
}

// 2년 내 신규 공급 세대 수 → 0-100 (적을수록 높음)
export function scoreSupply(newSupply2y) {
  if (newSupply2y <= 100) return 100;
  if (newSupply2y >= 3000) return 0;
  return Math.round((3000 - newSupply2y) / 2900 * 100);
}

// 기준별 rawScore(0-100) × 가중치 → 가중 합계
export function calcComplexScore(rawScores, weights) {
  return Math.round(
    CRITERIA.reduce((sum, key) => sum + (rawScores[key] ?? 0) * (weights[key] ?? 0) / 100, 0)
  );
}

// 총점 내림차순 정렬 (원본 불변)
export function rankComplexes(complexes) {
  return [...complexes].sort((a, b) => b.totalScore - a.totalScore);
}
