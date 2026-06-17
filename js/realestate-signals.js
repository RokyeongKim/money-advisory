export const SIGNAL_TYPES = {
  reconstruction: {
    maxStage: 5, label: '재건축/재개발',
    stages: ['추진위설립', '조합설립', '사업시행인가', '관리처분인가', '착공'],
  },
  transit: {
    maxStage: 4, label: 'GTX/교통망',
    stages: ['계획발표', '예비타당성통과', '착공', '개통'],
  },
  development: {
    maxStage: 4, label: '대형개발사업',
    stages: ['계획발표', '인허가', '착공', '완공'],
  },
  corporate: {
    maxStage: 3, label: '기업/기관이전',
    stages: ['계획발표', '확정', '이전완료'],
  },
  commercial: {
    maxStage: 3, label: '상권신규조성',
    stages: ['계획', '착공', '개점'],
  },
  school: {
    maxStage: 3, label: '학군변화',
    stages: ['신설계획', '확정', '개교'],
  },
};

// stageIndex 0-based → 1-based 점수
export function calcSignalScore(signal) {
  return signal.stageIndex + 1;
}

// 지역 내 모든 시그널 점수 합산
export function calcRegionTotalScore(signals) {
  return signals.reduce((sum, s) => sum + calcSignalScore(s), 0);
}

// 지역 배열 → totalScore 추가 후 내림차순 정렬 (원본 불변)
export function rankRegionsBySignals(regions) {
  return [...regions]
    .map(r => ({ ...r, totalScore: calcRegionTotalScore(r.signals) }))
    .sort((a, b) => b.totalScore - a.totalScore);
}

// 단계 진행 표시 배지: ●●●○○
export function getBadge(stageIndex, maxStage) {
  const filled = Math.min(stageIndex + 1, maxStage);
  return '●'.repeat(filled) + '○'.repeat(Math.max(0, maxStage - filled));
}

// 시그널의 현재 단계명 반환
export function getSignalStageName(signal) {
  return SIGNAL_TYPES[signal.type]?.stages[signal.stageIndex] ?? '알 수 없음';
}
