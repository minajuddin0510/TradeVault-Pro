import { store, createTrade } from "./storage.js";
import { renderAnalytics, getMonthlyReportsData } from "./analytics.js";
import { exportTradesToXlsx, exportBackupJson, parseImportFile, normalizeXlsxRowsToTrades } from "./exports.js";
import {
  formatCurrency,
  formatNumber,
  toDateInputValue,
  daysBetween,
  monthLabel,
  yearLabel,
  toMonthYearKey,
  unique
} from "./utils.js";

let state = store.getState();
let closeTargetTradeId = "";

const uiState = {
  closedTable: {
    page: 1,
    pageSize: 10,
    sortBy: "exitDate",
    sortDir: "desc"
  }
};

const q = (selector) => document.querySelector(selector);
const qAll = (selector) => [...document.querySelectorAll(selector)];

const persist = () => {
  store.saveState(state);
};

const setTheme = () => {
  const accent = state.theme.accent || "blue";
  const root = document.documentElement;
  if (accent === "teal") root.style.setProperty("--accent", "#00B8A9");
  else if (accent === "gold") root.style.setProperty("--accent", "#D6A73A");
  else root.style.setProperty("--accent", "#4F8CFF");
};

const initialSetup = () => {
  // Apply persisted theme and field defaults on first render.
  setTheme();

  q("#entryDate").value = toDateInputValue();
  q("#closeExitDate").value = toDateInputValue();
  q("#accentColorSelect").value = state.theme.accent || "blue";

  // On mobile/tablet, keep navigation collapsed by default for more canvas space.
  if (window.innerWidth <= 980) {
    q("#sidebar").classList.add("collapsed");
  }

  if (!state.username) {
    q("#welcomeModal").classList.remove("hidden");
  } else {
    q("#welcomeModal").classList.add("hidden");
  }

  q("#profileName").textContent = state.username || "Trader";
  q("#settingsNameInput").value = state.username || "";

  renderAll();
};

const computeKPIs = () => {
  // Dashboard metrics are all computed from current LocalStorage state.
  const totalTrades = state.trades.length;
  const openTrades = state.trades.filter((t) => t.status === "OPEN");
  const closedTrades = state.trades.filter((t) => t.status === "CLOSED");

  const profits = closedTrades.map((t) => Number(t.profitLoss || 0));
  const wins = profits.filter((p) => p > 0);
  const losses = profits.filter((p) => p < 0);
  const lifetimeProfit = profits.reduce((a, b) => a + b, 0);

  const nowKey = toMonthYearKey(new Date().toISOString());
  const monthlyProfit = closedTrades
    .filter((t) => toMonthYearKey(t.exitDate || t.entryDate) === nowKey)
    .reduce((sum, t) => sum + Number(t.profitLoss || 0), 0);

  const bestTrade = profits.length ? Math.max(...profits) : 0;
  const worstTrade = profits.length ? Math.min(...profits) : 0;
  const avgProfit = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;

  const streaks = computeStreaks(profits);

  return {
    "Total Trades": totalTrades,
    "Open Positions": openTrades.length,
    "Closed Positions": closedTrades.length,
    "Win Rate": `${closedTrades.length ? formatNumber((wins.length / closedTrades.length) * 100, 1) : "0.0"}%`,
    "Monthly Profit": formatCurrency(monthlyProfit),
    "Lifetime Profit": formatCurrency(lifetimeProfit),
    "Best Trade": formatCurrency(bestTrade),
    "Worst Trade": formatCurrency(worstTrade),
    "Average Profit": formatCurrency(avgProfit),
    "Average Loss": formatCurrency(avgLoss),
    "Largest Winning Streak": streaks.maxWin,
    "Largest Losing Streak": streaks.maxLoss
  };
};

const computeStreaks = (profits) => {
  let maxWin = 0;
  let maxLoss = 0;
  let currentWin = 0;
  let currentLoss = 0;

  profits.forEach((p) => {
    if (p > 0) {
      currentWin += 1;
      currentLoss = 0;
    } else if (p < 0) {
      currentLoss += 1;
      currentWin = 0;
    } else {
      currentWin = 0;
      currentLoss = 0;
    }
    maxWin = Math.max(maxWin, currentWin);
    maxLoss = Math.max(maxLoss, currentLoss);
  });

  return { maxWin, maxLoss };
};

const renderDashboard = () => {
  const kpis = computeKPIs();
  const grid = q("#kpiGrid");

  grid.innerHTML = Object.entries(kpis)
    .map(([label, value]) => `
      <article class="kpi-card">
        <p>${label}</p>
        <h3>${value}</h3>
      </article>
    `)
    .join("");
};

const renderOpenPositions = () => {
  const wrap = q("#openPositionsGrid");
  const openTrades = state.trades.filter((t) => t.status === "OPEN");

  if (!openTrades.length) {
    wrap.innerHTML = "<p class='muted'>No open positions. Create a trade from Add Trade.</p>";
    return;
  }

  wrap.innerHTML = openTrades
    .map((trade) => {
      const daysOpen = daysBetween(trade.entryDate);
      const currentPL = Number(trade.currentPrice)
        ? (Number(trade.currentPrice) - Number(trade.entryPrice || 0)) * Number(trade.quantity || 0)
        : null;
      return `
        <article class="position-card">
          <div class="position-top">
            <h3>${trade.assetDisplay}</h3>
            <span class="pill open">OPEN</span>
          </div>
          <p>${trade.tradeType}</p>
          <p>Direction: <strong>${trade.direction}</strong></p>
          <p>Open Date: <strong>${trade.entryDate || "-"}</strong></p>
          <p>Days Open: <strong>${daysOpen}</strong></p>
          <p>Current P/L: <strong class="${currentPL === null ? "muted-text" : currentPL >= 0 ? "profit" : "loss"}">${
            currentPL === null ? "--" : formatCurrency(currentPL)
          }</strong></p>
          <p>Expiry Date: <strong>${trade.expiryDate || "-"}</strong></p>

          <div class="card-actions">
            <button class="btn btn-ghost" data-action="edit-open" data-id="${trade.id}" type="button">Edit</button>
            <button class="btn btn-primary" data-action="close-open" data-id="${trade.id}" type="button">Close Position</button>
            <button class="btn btn-danger" data-action="delete-open" data-id="${trade.id}" type="button">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
};

const getClosedRows = () => {
  return state.trades
    .filter((t) => t.status === "CLOSED")
    .map((t) => ({
      ...t,
      monthLabel: monthLabel(t.exitDate || t.entryDate),
      yearLabel: yearLabel(t.exitDate || t.entryDate),
      durationLabel: t.positionDuration || "-"
    }));
};

const filterClosedRows = (rows) => {
  const search = q("#closedSearch").value.trim().toLowerCase();
  const month = q("#closedMonthFilter").value;
  const asset = q("#closedAssetFilter").value;
  const result = q("#closedResultFilter").value;

  return rows.filter((r) => {
    const searchable = [
      r.assetDisplay,
      r.tradeType,
      r.direction,
      r.notes,
      r.monthLabel,
      r.yearLabel
    ]
      .join(" ")
      .toLowerCase();

    const matchSearch = !search || searchable.includes(search);
    const matchMonth = month === "all" || toMonthYearKey(r.exitDate || r.entryDate) === month;
    const matchAsset = asset === "all" || r.assetDisplay === asset;
    const pnl = Number(r.profitLoss || 0);
    const matchResult = result === "all" || (result === "win" ? pnl > 0 : pnl < 0);

    return matchSearch && matchMonth && matchAsset && matchResult;
  });
};

const sortClosedRows = (rows) => {
  const { sortBy, sortDir } = uiState.closedTable;
  return [...rows].sort((a, b) => {
    const va = a[sortBy] ?? "";
    const vb = b[sortBy] ?? "";

    const na = Number(va);
    const nb = Number(vb);
    let cmp;

    if (Number.isFinite(na) && Number.isFinite(nb) && (String(va).trim() !== "" || String(vb).trim() !== "")) {
      cmp = na - nb;
    } else {
      cmp = String(va).localeCompare(String(vb));
    }

    return sortDir === "asc" ? cmp : -cmp;
  });
};

const renderClosedFilters = () => {
  const rows = getClosedRows();
  const monthSelect = q("#closedMonthFilter");
  const assetSelect = q("#closedAssetFilter");

  const months = unique(rows.map((r) => toMonthYearKey(r.exitDate || r.entryDate))).sort((a, b) => b.localeCompare(a));
  const assets = unique(rows.map((r) => r.assetDisplay)).sort((a, b) => a.localeCompare(b));

  const prevMonth = monthSelect.value || "all";
  const prevAsset = assetSelect.value || "all";

  monthSelect.innerHTML = `<option value="all">All Months</option>${months.map((m) => `<option value="${m}">${m}</option>`).join("")}`;
  assetSelect.innerHTML = `<option value="all">All Assets</option>${assets.map((a) => `<option value="${a}">${a}</option>`).join("")}`;

  monthSelect.value = months.includes(prevMonth) ? prevMonth : "all";
  assetSelect.value = assets.includes(prevAsset) ? prevAsset : "all";
};

const renderClosedTable = () => {
  const body = q("#closedTableBody");
  const pageInfo = q("#closedPageInfo");

  const filtered = filterClosedRows(getClosedRows());
  const sorted = sortClosedRows(filtered);

  const totalPages = Math.max(1, Math.ceil(sorted.length / uiState.closedTable.pageSize));
  uiState.closedTable.page = Math.min(uiState.closedTable.page, totalPages);

  const start = (uiState.closedTable.page - 1) * uiState.closedTable.pageSize;
  const paged = sorted.slice(start, start + uiState.closedTable.pageSize);

  if (!paged.length) {
    body.innerHTML = `<tr><td colspan="11" class="muted">No closed positions found.</td></tr>`;
  } else {
    body.innerHTML = paged
      .map((r) => `
        <tr>
          <td>${r.exitDate || "-"}</td>
          <td>${r.assetDisplay}</td>
          <td>${r.tradeType}</td>
          <td>${r.direction}</td>
          <td>${formatNumber(r.entryPrice)}</td>
          <td>${formatNumber(r.exitPrice)}</td>
          <td class="${Number(r.profitLoss) >= 0 ? "profit" : "loss"}">${formatCurrency(r.profitLoss)}</td>
          <td>${r.status}</td>
          <td>${r.durationLabel}</td>
          <td>${r.monthLabel}</td>
          <td>${r.yearLabel}</td>
        </tr>
      `)
      .join("");
  }

  pageInfo.textContent = `Page ${uiState.closedTable.page} of ${totalPages}`;
};

const renderMonthlyReports = () => {
  const root = q("#monthlyReportsList");
  const reports = getMonthlyReportsData(state.trades.filter((t) => t.status === "CLOSED"));

  if (!reports.length) {
    root.innerHTML = "<p class='muted'>No monthly reports yet. Close trades to auto-generate reports.</p>";
    return;
  }

  root.innerHTML = reports
    .map((r) => `
      <article class="report-card">
        <h3>${r.monthName} ${r.year}</h3>
        <div class="report-grid">
          <p>Trades: <strong>${r.trades}</strong></p>
          <p>Wins: <strong>${r.wins}</strong></p>
          <p>Losses: <strong>${r.losses}</strong></p>
          <p>Win Rate: <strong>${formatNumber(r.winRate, 1)}%</strong></p>
          <p>Net Profit: <strong class="${r.netProfit >= 0 ? "profit" : "loss"}">${formatCurrency(r.netProfit)}</strong></p>
          <p>Best Trade: <strong class="profit">${formatCurrency(r.bestTrade)}</strong></p>
          <p>Worst Trade: <strong class="loss">${formatCurrency(r.worstTrade)}</strong></p>
          <p>Average Trade: <strong>${formatCurrency(r.avgTrade)}</strong></p>
        </div>
      </article>
    `)
    .join("");
};

const renderAll = () => {
  // Central render function after every write operation.
  renderDashboard();
  renderOpenPositions();
  renderClosedFilters();
  renderClosedTable();
  renderMonthlyReports();
  renderAnalytics({ trades: state.trades });
};

const switchPage = (pageKey) => {
  qAll(".menu-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.page === pageKey));
  qAll(".page").forEach((p) => p.classList.remove("active"));
  const target = q(`#page-${pageKey}`);
  if (target) target.classList.add("active");
};

const captureTradeFormData = () => {
  const asset = q("#asset").value;
  const customAsset = q("#assetName").value.trim();
  const assetDisplay = asset === "Others" ? customAsset || "Others" : asset;

  return {
    asset,
    assetDisplay,
    tradeType: q("#tradeType").value,
    direction: q("#direction").value,
    positionDuration: q("#positionDuration").value,
    entryDate: q("#entryDate").value,
    entryPrice: Number(q("#entryPrice").value || 0),
    quantity: Number(q("#quantity").value || 0),
    strikePrice: q("#strikePrice").value,
    expiryDate: q("#expiryDate").value,
    premium: q("#premium").value,
    marginUsed: q("#marginUsed").value,
    otmPercentage: q("#otmPercentage").value,
    trend: q("#trend").value,
    ivLevel: q("#ivLevel").value,
    notes: q("#notes").value.trim()
  };
};

const resetTradeForm = () => {
  q("#tradeForm").reset();
  q("#status").value = "OPEN";
  q("#entryDate").value = toDateInputValue();
  q("#assetNameWrap").classList.add("hidden");
  qAll(".otm-btn").forEach((b) => b.classList.remove("active"));
};

const saveNewTrade = () => {
  const form = q("#tradeForm");
  if (!form.reportValidity()) return;

  const data = captureTradeFormData();
  if (data.asset === "Others" && !data.assetDisplay.trim()) {
    alert("Please enter Asset Name when selecting Others.");
    return;
  }

  const trade = createTrade(data);
  // New entries are prepended so latest activity appears first.
  state.trades.unshift(trade);
  persist();
  renderAll();
  resetTradeForm();
  switchPage("open-positions");
};

const openCloseModal = (tradeId) => {
  closeTargetTradeId = tradeId;
  q("#closeTradeModal").classList.remove("hidden");
};

const closeCloseModal = () => {
  closeTargetTradeId = "";
  q("#closeTradeModal").classList.add("hidden");
  q("#closeTradeForm").reset();
  q("#closeExitDate").value = toDateInputValue();
};

const closeTrade = () => {
  const form = q("#closeTradeForm");
  if (!form.reportValidity()) return;

  const trade = state.trades.find((t) => t.id === closeTargetTradeId);
  if (!trade) return;

  trade.status = "CLOSED";
  trade.exitDate = q("#closeExitDate").value;
  trade.exitPrice = Number(q("#closeExitPrice").value || 0);
  trade.profitLoss = Number(q("#closePnL").value || 0);
  trade.notes = [trade.notes, q("#closeNotes").value.trim()].filter(Boolean).join("\n");
  trade.updatedAt = new Date().toISOString();

  persist();
  renderAll();
  closeCloseModal();
  switchPage("closed-positions");
};

const editOpenTrade = (tradeId) => {
  const trade = state.trades.find((t) => t.id === tradeId && t.status === "OPEN");
  if (!trade) return;

  const val = prompt("Enter latest mark/current price to track current P/L", trade.currentPrice || "");
  if (val === null) return;
  trade.currentPrice = Number(val || 0);
  trade.updatedAt = new Date().toISOString();
  persist();
  renderOpenPositions();
};

const deleteTrade = (tradeId) => {
  const ok = confirm("Delete this trade permanently?");
  if (!ok) return;
  state.trades = state.trades.filter((t) => t.id !== tradeId);
  persist();
  renderAll();
};

const exportFlow = (mode) => {
  exportTradesToXlsx({ trades: state.trades, mode });
};

const saveName = (value) => {
  const name = value.trim();
  if (!name) {
    alert("Please enter a valid name.");
    return false;
  }
  state.username = name;
  q("#profileName").textContent = name;
  q("#settingsNameInput").value = name;
  persist();
  return true;
};

const handleImport = async (file) => {
  if (!file) return;

  try {
    const result = await parseImportFile(file);

    if (result.type === "json") {
      const imported = result.data;
      if (!imported || !Array.isArray(imported.trades)) {
        throw new Error("Invalid backup JSON format.");
      }
      state = {
        username: imported.username || state.username,
        theme: imported.theme || state.theme,
        trades: imported.trades
      };
    } else if (result.type === "xlsx") {
      const trades = normalizeXlsxRowsToTrades(result.data);
      state.trades = trades;
    }

    persist();
    setTheme();
    renderAll();
    q("#profileName").textContent = state.username || "Trader";
    q("#settingsNameInput").value = state.username || "";
    alert("Import successful.");
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
};

const bindEvents = () => {
  q("#welcomeContinueBtn").addEventListener("click", () => {
    const ok = saveName(q("#firstTimeName").value);
    if (ok) q("#welcomeModal").classList.add("hidden");
  });

  q("#asset").addEventListener("change", (e) => {
    const show = e.target.value === "Others";
    q("#assetNameWrap").classList.toggle("hidden", !show);
  });

  qAll(".otm-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      qAll(".otm-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const value = btn.dataset.otm;
      if (value !== "custom") {
        q("#otmPercentage").value = value;
      } else {
        q("#otmPercentage").focus();
      }
    });
  });

  q("#tradeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveNewTrade();
  });

  q("#sidebarToggle").addEventListener("click", () => {
    q("#sidebar").classList.toggle("collapsed");
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) {
      q("#sidebar").classList.remove("collapsed");
    }
  });

  qAll(".menu-item").forEach((btn) => {
    btn.addEventListener("click", () => switchPage(btn.dataset.page));
  });

  q("#openPositionsGrid").addEventListener("click", (e) => {
    const target = e.target.closest("button[data-action]");
    if (!target) return;

    const { action, id } = target.dataset;
    if (action === "edit-open") editOpenTrade(id);
    if (action === "close-open") openCloseModal(id);
    if (action === "delete-open") deleteTrade(id);
  });

  q("#closeTradeCancelX").addEventListener("click", closeCloseModal);
  q("#closeTradeCancelBtn").addEventListener("click", closeCloseModal);
  q("#closeTradeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    closeTrade();
  });

  q("#profileBtn").addEventListener("click", () => {
    const menu = q("#profileMenu");
    const expanded = !menu.classList.contains("hidden");
    menu.classList.toggle("hidden");
    q("#profileBtn").setAttribute("aria-expanded", String(!expanded));
  });

  document.addEventListener("click", (e) => {
    const menu = q("#profileMenu");
    const btn = q("#profileBtn");
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    }
  });

  q("#profileMenu").addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    if (action === "edit-name") {
      const name = prompt("Enter your name", state.username || "");
      if (name !== null) saveName(name);
    }

    if (action === "export-data") exportFlow("entire");

    if (action === "import-data") q("#importFileInput").click();

    if (action === "reset-journal") {
      const ok = confirm("Reset all journal data? This cannot be undone.");
      if (ok) {
        state.trades = [];
        persist();
        renderAll();
      }
    }

    q("#profileMenu").classList.add("hidden");
  });

  q("#importFileInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    await handleImport(file);
    e.target.value = "";
  });

  q("#closedSearch").addEventListener("input", () => {
    uiState.closedTable.page = 1;
    renderClosedTable();
  });

  ["#closedMonthFilter", "#closedAssetFilter", "#closedResultFilter"].forEach((id) => {
    q(id).addEventListener("change", () => {
      uiState.closedTable.page = 1;
      renderClosedTable();
    });
  });

  qAll("#closedTable th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const nextSort = th.dataset.sort;
      if (uiState.closedTable.sortBy === nextSort) {
        uiState.closedTable.sortDir = uiState.closedTable.sortDir === "asc" ? "desc" : "asc";
      } else {
        uiState.closedTable.sortBy = nextSort;
        uiState.closedTable.sortDir = "asc";
      }
      renderClosedTable();
    });
  });

  q("#closedPrevPage").addEventListener("click", () => {
    uiState.closedTable.page = Math.max(1, uiState.closedTable.page - 1);
    renderClosedTable();
  });

  q("#closedNextPage").addEventListener("click", () => {
    const filtered = filterClosedRows(getClosedRows());
    const totalPages = Math.max(1, Math.ceil(filtered.length / uiState.closedTable.pageSize));
    uiState.closedTable.page = Math.min(totalPages, uiState.closedTable.page + 1);
    renderClosedTable();
  });

  qAll(".export-btn").forEach((btn) => {
    btn.addEventListener("click", () => exportFlow(btn.dataset.export));
  });

  q("#settingsSaveNameBtn").addEventListener("click", () => {
    saveName(q("#settingsNameInput").value);
  });

  q("#saveThemeBtn").addEventListener("click", () => {
    state.theme.accent = q("#accentColorSelect").value;
    persist();
    setTheme();
  });

  q("#exportBackupBtn").addEventListener("click", () => exportBackupJson(state));
  q("#importBackupBtn").addEventListener("click", () => q("#importFileInput").click());

  q("#resetAllDataBtn").addEventListener("click", () => {
    const ok = confirm("Reset all data including name and preferences?");
    if (!ok) return;
    store.reset();
    state = store.getState();
    setTheme();
    initialSetup();
  });

  q("#closeTradeModal").addEventListener("click", (e) => {
    if (e.target.id === "closeTradeModal") closeCloseModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      q("#profileMenu").classList.add("hidden");
      closeCloseModal();
    }
  });
};

bindEvents();
initialSetup();

// Register a lightweight service worker for installability/offline shell cache.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Silent failure keeps the app functional in restricted environments.
    });
  });
}
