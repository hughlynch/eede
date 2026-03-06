// Chart rendering for EE notebooks.
//
// Provides a ui.Chart shim that generates chart HTML
// for display in notebook cell outputs. Charts are
// rendered as SVG via a simple charting implementation
// (no external dependencies).

export interface ChartData {
  type: 'scatter' | 'line' | 'bar' | 'histogram';
  title: string;
  xLabel: string;
  yLabel: string;
  series: Array<{
    label: string;
    data: Array<{ x: number; y: number }>;
  }>;
}

export function chartToHtml(chart: ChartData): string {
  const w = 600;
  const h = 350;
  const pad = { top: 40, right: 20, bottom: 50, left: 60 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Compute data ranges.
  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  for (const s of chart.series) {
    for (const d of s.data) {
      if (d.x < xMin) xMin = d.x;
      if (d.x > xMax) xMax = d.x;
      if (d.y < yMin) yMin = d.y;
      if (d.y > yMax) yMax = d.y;
    }
  }
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  // Add padding.
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;
  yMin -= yRange * 0.05;
  yMax += yRange * 0.05;

  const sx = (x: number) =>
    pad.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y: number) =>
    pad.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  const colors = [
    '#4285f4', '#ea4335', '#fbbc04', '#34a853',
    '#ff6d01', '#46bdc6', '#7baaf7', '#f07b72',
  ];

  let paths = '';
  chart.series.forEach((s, i) => {
    const color = colors[i % colors.length];
    if (
      chart.type === 'line' ||
      chart.type === 'scatter'
    ) {
      // Draw line.
      if (chart.type === 'line' && s.data.length > 1) {
        const sorted = [...s.data].sort(
          (a, b) => a.x - b.x
        );
        const d = sorted
          .map(
            (p, j) =>
              `${j === 0 ? 'M' : 'L'}${sx(p.x)},${sy(p.y)}`
          )
          .join(' ');
        paths +=
          `<path d="${d}" fill="none" ` +
          `stroke="${color}" stroke-width="2"/>`;
      }
      // Draw points.
      for (const p of s.data) {
        paths +=
          `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" ` +
          `r="3" fill="${color}"/>`;
      }
    } else if (chart.type === 'bar') {
      const barW = Math.max(
        2,
        plotW / (s.data.length * chart.series.length) - 2
      );
      s.data.forEach((p, j) => {
        const x =
          sx(p.x) -
          barW * chart.series.length / 2 +
          i * barW;
        const barH = sy(yMin) - sy(p.y);
        paths +=
          `<rect x="${x}" y="${sy(p.y)}" ` +
          `width="${barW}" height="${barH}" ` +
          `fill="${color}" opacity="0.8"/>`;
      });
    }
  });

  // Axes.
  const xAxisY = pad.top + plotH;
  const yAxisX = pad.left;

  // Tick marks (5 each).
  let ticks = '';
  for (let i = 0; i <= 4; i++) {
    const xVal = xMin + (i / 4) * (xMax - xMin);
    const yVal = yMin + (i / 4) * (yMax - yMin);
    ticks +=
      `<text x="${sx(xVal)}" y="${xAxisY + 15}" ` +
      `text-anchor="middle" font-size="10" ` +
      `fill="currentColor">${fmtNum(xVal)}</text>`;
    ticks +=
      `<text x="${yAxisX - 8}" y="${sy(yVal) + 3}" ` +
      `text-anchor="end" font-size="10" ` +
      `fill="currentColor">${fmtNum(yVal)}</text>`;
    // Grid lines.
    ticks +=
      `<line x1="${pad.left}" y1="${sy(yVal)}" ` +
      `x2="${pad.left + plotW}" y2="${sy(yVal)}" ` +
      `stroke="currentColor" opacity="0.1"/>`;
  }

  // Legend.
  let legend = '';
  chart.series.forEach((s, i) => {
    const lx = pad.left + 10;
    const ly = pad.top + 15 + i * 16;
    const color = colors[i % colors.length];
    legend +=
      `<rect x="${lx}" y="${ly - 8}" width="10" ` +
      `height="10" fill="${color}" rx="2"/>`;
    legend +=
      `<text x="${lx + 14}" y="${ly}" font-size="11" ` +
      `fill="currentColor">${escHtml(s.label)}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="0 0 ${w} ${h}" ` +
    `style="max-width:${w}px; font-family: sans-serif;">` +
    // Title.
    `<text x="${w / 2}" y="20" text-anchor="middle" ` +
    `font-size="14" font-weight="bold" ` +
    `fill="currentColor">${escHtml(chart.title)}</text>` +
    // Axes.
    `<line x1="${yAxisX}" y1="${pad.top}" ` +
    `x2="${yAxisX}" y2="${xAxisY}" ` +
    `stroke="currentColor" opacity="0.3"/>` +
    `<line x1="${yAxisX}" y1="${xAxisY}" ` +
    `x2="${pad.left + plotW}" y2="${xAxisY}" ` +
    `stroke="currentColor" opacity="0.3"/>` +
    // Labels.
    `<text x="${w / 2}" y="${h - 5}" ` +
    `text-anchor="middle" font-size="11" ` +
    `fill="currentColor">${escHtml(chart.xLabel)}</text>` +
    `<text x="12" y="${h / 2}" ` +
    `text-anchor="middle" font-size="11" ` +
    `fill="currentColor" ` +
    `transform="rotate(-90, 12, ${h / 2})">` +
    `${escHtml(chart.yLabel)}</text>` +
    ticks + paths + legend +
    `</svg>`;
}

// JS code injected into the cell runner to shim
// ui.Chart and collect chart data.
export function chartShimJS(): string {
  return `
const __charts = [];
const ui = {
  Chart: {
    image: {
      series: function(collection, region, reducer,
                       scale, xProp) {
        __charts.push({
          type: 'line', title: 'Image Series',
          xLabel: xProp || 'time',
          yLabel: 'value', series: []
        });
        return {
          setOptions: function(opts) {
            const idx = __charts.length - 1;
            if (opts.title) __charts[idx].title = opts.title;
            if (opts.hAxis && opts.hAxis.title)
              __charts[idx].xLabel = opts.hAxis.title;
            if (opts.vAxis && opts.vAxis.title)
              __charts[idx].yLabel = opts.vAxis.title;
          }
        };
      }
    },
    feature: {
      byFeature: function(fc, xProp, yProps) {
        __charts.push({
          type: 'bar',
          title: 'Feature Chart',
          xLabel: xProp || '',
          yLabel: '',
          series: (yProps || []).map(function(p) {
            return { label: p, data: [] };
          })
        });
        return {
          setOptions: function(opts) {
            const idx = __charts.length - 1;
            if (opts.title) __charts[idx].title = opts.title;
          }
        };
      }
    }
  }
};
`;
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
