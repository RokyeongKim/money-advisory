Chart.register(ChartDataLabels);

const instances = {};

function make(id, config) {
  if (instances[id]) instances[id].destroy();
  const ctx = document.getElementById(id).getContext('2d');
  instances[id] = new Chart(ctx, config);
}

const GRID = '#1f2937';
const TICK = '#6b7280';

export function renderAssetBarChart(id, categories) {
  const total = categories.reduce((s, c) => s + c.valueKrw, 0);
  make(id, {
    type: 'bar',
    data: {
      labels: categories.map(c => c.label),
      datasets: [{
        data: categories.map(c => c.valueKrw),
        backgroundColor: categories.map(c => c.color),
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `₩${ctx.parsed.x.toLocaleString()}` } },
        datalabels: {
          anchor: 'end', align: 'end',
          color: TICK, font: { size: 11 },
          formatter: (v) =>
            `₩${(v / 1e6).toFixed(0)}M  ${((v / total) * 100).toFixed(1)}%`,
        },
      },
      scales: {
        x: { ticks: { callback: v => `₩${(v / 1e8).toFixed(1)}억`, color: TICK }, grid: { color: GRID } },
        y: { ticks: { color: '#e5e7eb' }, grid: { display: false } },
      },
    },
  });
}

export function renderTrendChart(id, snapshotArr) {
  const barColors = snapshotArr.map(s =>
    s.netIncrease > 5000000 ? '#16a34a' :
    s.netIncrease > 0       ? '#86efac' : '#f97316'
  );
  make(id, {
    type: 'bar',
    data: {
      labels: snapshotArr.map(s => s.yearMonth),
      datasets: [
        {
          type: 'line',
          label: '총자산',
          data: snapshotArr.map(s => s.totalAsset),
          borderColor: '#60a5fa',
          backgroundColor: 'transparent',
          tension: 0.3,
          pointRadius: 4,
          yAxisID: 'yL',
        },
        {
          type: 'bar',
          label: '월 순증가',
          data: snapshotArr.map(s => s.netIncrease),
          backgroundColor: barColors,
          yAxisID: 'yR',
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#e5e7eb' } },
        datalabels: { display: false },
        tooltip: { callbacks: { label: ctx => `₩${ctx.parsed.y.toLocaleString()}` } },
      },
      scales: {
        yL: { position: 'left',  ticks: { callback: v => `₩${(v/1e8).toFixed(1)}억`, color: '#60a5fa' }, grid: { color: GRID } },
        yR: { position: 'right', ticks: { callback: v => `₩${(v/1e6).toFixed(0)}M`,  color: TICK      }, grid: { display: false } },
        x:  { ticks: { color: TICK } },
      },
    },
  });
}

export function renderSavingSpeedChart(id, monthlyData) {
  make(id, {
    type: 'bar',
    data: {
      labels: monthlyData.map(m => m.yearMonth),
      datasets: [
        { label: '저축', data: monthlyData.map(m => m.savings),  backgroundColor: '#16a34a', stack: 's', borderRadius: { topLeft: 4, topRight: 4 } },
        { label: '지출', data: monthlyData.map(m => m.spending), backgroundColor: '#dc2626', stack: 's' },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#e5e7eb' } },
        datalabels: { display: false },
        tooltip: { callbacks: { label: ctx => `₩${ctx.parsed.y.toLocaleString()}` } },
      },
      scales: {
        x: { stacked: true, ticks: { color: TICK } },
        y: { stacked: true, ticks: { callback: v => `₩${(v/1e6).toFixed(0)}M`, color: TICK }, grid: { color: GRID } },
      },
    },
  });
}

export function renderSpendingCategoryChart(id, categories) {
  const sorted = [...categories].sort((a, b) => b.amount - a.amount);
  make(id, {
    type: 'bar',
    data: {
      labels: sorted.map(c => c.label),
      datasets: [{ data: sorted.map(c => c.amount), backgroundColor: '#f97316', borderRadius: 4 }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: { callbacks: { label: ctx => `₩${ctx.parsed.x.toLocaleString()}` } },
      },
      scales: {
        x: { ticks: { callback: v => `₩${(v/1e4).toFixed(0)}만`, color: TICK }, grid: { color: GRID } },
        y: { ticks: { color: '#e5e7eb' } },
      },
    },
  });
}

export function renderAllocationDonut(id, categories) {
  const total = categories.reduce((s, c) => s + c.valueKrw, 0);
  if (total === 0) return;
  make(id, {
    type: 'doughnut',
    data: {
      labels: categories.map(c => c.label),
      datasets: [{
        data: categories.map(c => c.valueKrw),
        backgroundColor: categories.map(c => c.color),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 11 }, padding: 8 } },
        datalabels: {
          color: '#fff',
          font: { size: 12, weight: 'bold' },
          formatter: (v) => {
            if (v === 0) return '';
            const pct = `${((v / total) * 100).toFixed(0)}%`;
            const amt = v >= 1e8 ? `₩${(v / 1e8).toFixed(1)}억` : `₩${Math.round(v / 1e4).toLocaleString()}만`;
            return [pct, amt];
          },
        },
        tooltip: { callbacks: { label: ctx => `₩${ctx.parsed.toLocaleString()}` } },
      },
    },
  });
}

export function renderRetirementProjectionChart(id, { historical, optimistic, pessimistic, retirementYear, currentAge, currentYear }) {
  const allLabels = [
    ...historical.map(s => s.year),
    ...optimistic.map(p => p.year),
  ].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

  make(id, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        {
          label: '실적',
          data: allLabels.map(y => {
            const h = historical.find(s => s.year === y);
            return h ? h.value : null;
          }),
          borderColor: '#60a5fa',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          spanGaps: false,
        },
        {
          label: '희망 8%',
          data: allLabels.map(y => {
            const p = optimistic.find(s => s.year === y);
            return p ? p.value : null;
          }),
          borderColor: '#34d399',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          spanGaps: false,
        },
        {
          label: '절망 2%',
          data: allLabels.map(y => {
            const p = pessimistic.find(s => s.year === y);
            return p ? p.value : null;
          }),
          borderColor: '#f87171',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#e5e7eb', font: { size: 11 } } },
        datalabels: { display: false },
        tooltip: { callbacks: { label: ctx => `₩${(ctx.parsed.y / 1e8).toFixed(1)}억` } },
      },
      scales: {
        x: {
          ticks: {
            color: TICK,
            maxTicksLimit: 8,
            callback: (_, i) => {
              if (i >= allLabels.length) return null;
              const y = allLabels[i];
              const age = (currentAge != null && currentYear != null)
                ? `${currentAge + (y - currentYear)}세` : null;
              const yearLabel = y === retirementYear ? `${y} 🎯` : String(y);
              return age ? [yearLabel, age] : yearLabel;
            },
          },
          grid: { color: GRID },
        },
        y: {
          ticks: { callback: v => `₩${(v / 1e8).toFixed(0)}억`, color: TICK },
          grid: { color: GRID },
        },
      },
    },
  });
}

export function renderDebtEquityBar(id, totalAsset, totalDebt) {
  const debt = Math.min(totalDebt, totalAsset);
  const equity = Math.max(0, totalAsset - debt);
  const debtPct = totalAsset > 0 ? Math.round((debt / totalAsset) * 100) : 0;
  const equityPct = 100 - debtPct;
  make(id, {
    type: 'bar',
    data: {
      labels: [''],
      datasets: [
        { label: `부채 ${debtPct}%`, data: [debtPct], backgroundColor: '#ef4444' },
        { label: `자본 ${equityPct}%`, data: [equityPct], backgroundColor: '#10b981' },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: TICK, font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label} (₩${((c.datasetIndex === 0 ? debt : equity) / 1e8).toFixed(1)}억)` } },
        datalabels: {
          color: '#fff',
          font: { size: 11, weight: 'bold' },
          formatter: v => v > 8 ? `${v}%` : '',
        },
      },
      scales: {
        x: { stacked: true, max: 100, display: false },
        y: { stacked: true, display: false },
      },
    },
  });
}
