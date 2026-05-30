import {
  monthLabel,
  toMonthYearKey,
  unique,
  formatNumber,
  formatCurrency
} from "./utils.js";

let chartRegistry = [];

const destroyCharts = () => {
  chartRegistry.forEach((chart) => chart.destroy());
  chartRegistry = [];
};

const chartTextColor = "#c9d3df";
const gridColor = "rgba(156,163,175,0.18)";

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: chartTextColor,
        font: { family: "IBM Plex Sans" }
      }
    }
  },
  scales: {
    x: {
      ticks: { color: chartTextColor },
      grid: { color: gridColor }
    },
    y: {
      ticks: { color: chartTextColor },
      grid: { color: gridColor }
    }
  }
};

const buildMonthlySeries = (closedTrades) => {
  const map = new Map();
  closedTrades.forEach((t) => {
    const key = toMonthYearKey(t.exitDate || t.entryDate);
    const prev = map.get(key) || 0;
    map.set(key, prev + Number(t.profitLoss || 0));
  });
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
};

const winRateBy = (closedTrades, field) => {
  const map = new Map();
  closedTrades.forEach((t) => {
    const key = t[field] || "Unknown";
    const item = map.get(key) || { wins: 0, total: 0 };
    item.total += 1;
    if (Number(t.profitLoss) > 0) item.wins += 1;
    map.set(key, item);
  });
  const labels = [...map.keys()];
  const data = labels.map((l) => {
    const row = map.get(l);
    return row.total ? (row.wins / row.total) * 100 : 0;
  });
  return { labels, data };
};

const sumBy = (closedTrades, field) => {
  const map = new Map();
  closedTrades.forEach((t) => {
    const key = t[field] || "Unknown";
    map.set(key, (map.get(key) || 0) + Number(t.profitLoss || 0));
  });
  return {
    labels: [...map.keys()],
    data: [...map.values()]
  };
};

const computeEquityAndDrawdown = (closedTrades) => {
  const sorted = [...closedTrades].sort((a, b) => {
    const da = new Date(a.exitDate || a.entryDate).getTime();
    const db = new Date(b.exitDate || b.entryDate).getTime();
    return da - db;
  });

  let equity = 0;
  let peak = 0;
  const labels = [];
  const equitySeries = [];
  const drawdownSeries = [];

  sorted.forEach((trade, index) => {
    equity += Number(trade.profitLoss || 0);
    peak = Math.max(peak, equity);
    const dd = equity - peak;
    labels.push(String(index + 1));
    equitySeries.push(equity);
    drawdownSeries.push(dd);
  });

  return { labels, equitySeries, drawdownSeries };
};

export const renderAnalytics = ({ trades }) => {
  destroyCharts();
  const closedTrades = trades.filter((t) => t.status === "CLOSED");
  const openTrades = trades.filter((t) => t.status === "OPEN");

  const eq = computeEquityAndDrawdown(closedTrades);
  const monthly = buildMonthlySeries(closedTrades);
  const byAsset = sumBy(closedTrades, "assetDisplay");
  const byType = sumBy(closedTrades, "tradeType");
  const wrAsset = winRateBy(closedTrades, "assetDisplay");
  const wrType = winRateBy(closedTrades, "tradeType");
  const wrTrend = winRateBy(closedTrades, "trend");

  const chartDefs = [
    {
      id: "chartEquityCurve",
      cfg: {
        type: "line",
        data: {
          labels: eq.labels,
          datasets: [{
            label: "Equity",
            data: eq.equitySeries,
            borderColor: "#4F8CFF",
            backgroundColor: "rgba(79,140,255,0.25)",
            fill: true,
            tension: 0.25
          }]
        },
        options: baseOptions
      }
    },
    {
      id: "chartMonthlyProfit",
      cfg: {
        type: "bar",
        data: {
          labels: monthly.map(([m]) => m),
          datasets: [{
            label: "Monthly Profit",
            data: monthly.map(([, p]) => p),
            backgroundColor: monthly.map(([, p]) => (p >= 0 ? "#00C853" : "#FF5252"))
          }]
        },
        options: baseOptions
      }
    },
    {
      id: "chartProfitByAsset",
      cfg: {
        type: "bar",
        data: {
          labels: byAsset.labels,
          datasets: [{
            label: "Profit",
            data: byAsset.data,
            backgroundColor: "rgba(79,140,255,0.85)"
          }]
        },
        options: baseOptions
      }
    },
    {
      id: "chartProfitByStrategy",
      cfg: {
        type: "doughnut",
        data: {
          labels: byType.labels,
          datasets: [{
            label: "Strategy Profit",
            data: byType.data,
            backgroundColor: ["#4F8CFF", "#00C853", "#FFB300", "#FF5252", "#607D8B", "#26C6DA", "#8BC34A", "#AB47BC"]
          }]
        },
        options: { ...baseOptions, scales: undefined }
      }
    },
    {
      id: "chartWinRateByAsset",
      cfg: {
        type: "bar",
        data: {
          labels: wrAsset.labels,
          datasets: [{
            label: "Win Rate %",
            data: wrAsset.data,
            backgroundColor: "rgba(0,200,83,0.75)"
          }]
        },
        options: baseOptions
      }
    },
    {
      id: "chartWinRateByTradeType",
      cfg: {
        type: "bar",
        data: {
          labels: wrType.labels,
          datasets: [{
            label: "Win Rate %",
            data: wrType.data,
            backgroundColor: "rgba(79,140,255,0.75)"
          }]
        },
        options: baseOptions
      }
    },
    {
      id: "chartWinRateByTrend",
      cfg: {
        type: "radar",
        data: {
          labels: wrTrend.labels,
          datasets: [{
            label: "Win Rate %",
            data: wrTrend.data,
            borderColor: "#4F8CFF",
            backgroundColor: "rgba(79,140,255,0.3)"
          }]
        },
        options: {
          ...baseOptions,
          scales: {
            r: {
              angleLines: { color: gridColor },
              grid: { color: gridColor },
              pointLabels: { color: chartTextColor },
              ticks: { color: chartTextColor, backdropColor: "transparent" }
            }
          }
        }
      }
    },
    {
      id: "chartOpenVsClosed",
      cfg: {
        type: "pie",
        data: {
          labels: ["Open", "Closed"],
          datasets: [{
            data: [openTrades.length, closedTrades.length],
            backgroundColor: ["#FFB300", "#00C853"]
          }]
        },
        options: { ...baseOptions, scales: undefined }
      }
    },
    {
      id: "chartDrawdown",
      cfg: {
        type: "line",
        data: {
          labels: eq.labels,
          datasets: [{
            label: "Drawdown",
            data: eq.drawdownSeries,
            borderColor: "#FF5252",
            backgroundColor: "rgba(255,82,82,0.2)",
            fill: true,
            tension: 0.25
          }]
        },
        options: baseOptions
      }
    }
  ];

  chartDefs.forEach(({ id, cfg }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const chart = new Chart(el, cfg);
    chartRegistry.push(chart);
  });

  renderHeatmap(closedTrades);
  renderHighlights(closedTrades);
};

const renderHeatmap = (closedTrades) => {
  const root = document.getElementById("monthlyHeatmap");
  if (!root) return;

  const monthly = buildMonthlySeries(closedTrades);
  if (!monthly.length) {
    root.innerHTML = "<p class=\"muted\">No monthly performance yet.</p>";
    return;
  }

  const maxAbs = Math.max(...monthly.map(([, p]) => Math.abs(p)), 1);
  root.innerHTML = monthly.map(([key, profit]) => {
    const intensity = Math.min(Math.abs(profit) / maxAbs, 1);
    const alpha = 0.16 + intensity * 0.68;
    const bg = profit >= 0 ? `rgba(0,200,83,${alpha})` : `rgba(255,82,82,${alpha})`;
    const dt = new Date(`${key}-01`);
    const label = dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    return `<div class=\"heatmap-cell\" style=\"background:${bg}\"><span>${label}</span><strong>${formatCurrency(profit)}</strong></div>`;
  }).join("");
};

const renderHighlights = (closedTrades) => {
  const root = document.getElementById("performanceHighlights");
  if (!root) return;

  if (!closedTrades.length) {
    root.innerHTML = "<p class=\"muted\">Close trades to unlock highlights.</p>";
    return;
  }

  const byAsset = sumBy(closedTrades, "assetDisplay");
  const byType = sumBy(closedTrades, "tradeType");

  const topAssetIndex = byAsset.data.reduce((best, v, i, arr) => (v > arr[best] ? i : best), 0);
  const bottomAssetIndex = byAsset.data.reduce((worst, v, i, arr) => (v < arr[worst] ? i : worst), 0);
  const topTypeIndex = byType.data.reduce((best, v, i, arr) => (v > arr[best] ? i : best), 0);

  const rows = [
    ["Top Performing Asset", `${byAsset.labels[topAssetIndex]} (${formatCurrency(byAsset.data[topAssetIndex])})`],
    ["Bottom Performing Asset", `${byAsset.labels[bottomAssetIndex]} (${formatCurrency(byAsset.data[bottomAssetIndex])})`],
    ["Most Profitable Strategy", `${byType.labels[topTypeIndex]} (${formatCurrency(byType.data[topTypeIndex])})`],
    ["Tracked Assets", unique(closedTrades.map((t) => t.assetDisplay)).length],
    ["Avg Closed Trade", formatCurrency(closedTrades.reduce((sum, t) => sum + Number(t.profitLoss || 0), 0) / closedTrades.length)],
    ["Positive Months", monthlyPositiveRate(closedTrades)]
  ];

  root.innerHTML = rows.map(([label, value]) => `<div class=\"highlight-row\"><span>${label}</span><strong>${value}</strong></div>`).join("");
};

const monthlyPositiveRate = (closedTrades) => {
  const monthly = buildMonthlySeries(closedTrades);
  if (!monthly.length) return "0%";
  const positive = monthly.filter(([, p]) => p > 0).length;
  const rate = (positive / monthly.length) * 100;
  return `${formatNumber(rate, 1)}%`;
};

export const getMonthlyReportsData = (closedTrades) => {
  const grouped = new Map();

  closedTrades.forEach((t) => {
    const key = toMonthYearKey(t.exitDate || t.entryDate);
    const dt = new Date(`${key}-01`);
    const row = grouped.get(key) || {
      key,
      monthName: dt.toLocaleDateString("en-US", { month: "long" }),
      year: dt.getFullYear(),
      trades: 0,
      wins: 0,
      losses: 0,
      netProfit: 0,
      bestTrade: -Infinity,
      worstTrade: Infinity
    };

    const pnl = Number(t.profitLoss || 0);
    row.trades += 1;
    row.netProfit += pnl;
    if (pnl > 0) row.wins += 1;
    if (pnl < 0) row.losses += 1;
    row.bestTrade = Math.max(row.bestTrade, pnl);
    row.worstTrade = Math.min(row.worstTrade, pnl);

    grouped.set(key, row);
  });

  return [...grouped.values()]
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((r) => ({
      ...r,
      winRate: r.trades ? (r.wins / r.trades) * 100 : 0,
      avgTrade: r.trades ? r.netProfit / r.trades : 0,
      bestTrade: Number.isFinite(r.bestTrade) ? r.bestTrade : 0,
      worstTrade: Number.isFinite(r.worstTrade) ? r.worstTrade : 0
    }));
};

export const getAnalyticsSummaryForExport = (trades) => {
  const closedTrades = trades.filter((t) => t.status === "CLOSED");
  const totalProfit = closedTrades.reduce((sum, t) => sum + Number(t.profitLoss || 0), 0);
  const wins = closedTrades.filter((t) => Number(t.profitLoss || 0) > 0).length;
  const losses = closedTrades.filter((t) => Number(t.profitLoss || 0) < 0).length;
  return [
    { Metric: "Total Trades", Value: trades.length },
    { Metric: "Open Trades", Value: trades.filter((t) => t.status === "OPEN").length },
    { Metric: "Closed Trades", Value: closedTrades.length },
    { Metric: "Wins", Value: wins },
    { Metric: "Losses", Value: losses },
    { Metric: "Win Rate", Value: `${closedTrades.length ? ((wins / closedTrades.length) * 100).toFixed(2) : "0.00"}%` },
    { Metric: "Net Profit", Value: totalProfit }
  ];
};
