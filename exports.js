import { getMonthlyReportsData, getAnalyticsSummaryForExport } from "./analytics.js";
import { formatCurrency, toMonthYearKey } from "./utils.js";

const fileNameWithDate = (label) => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `tradevault_${label}_${date}.xlsx`;
};

const buildTradeRows = (trades) => trades.map((t) => ({
  ID: t.id,
  Status: t.status,
  Asset: t.assetDisplay,
  TradeType: t.tradeType,
  Direction: t.direction,
  PositionDuration: t.positionDuration,
  EntryDate: t.entryDate,
  EntryPrice: Number(t.entryPrice || 0),
  ExitDate: t.exitDate || "",
  ExitPrice: t.exitPrice ? Number(t.exitPrice) : "",
  ProfitLoss: Number(t.profitLoss || 0),
  Quantity: Number(t.quantity || 0),
  StrikePrice: t.strikePrice || "",
  ExpiryDate: t.expiryDate || "",
  Premium: t.premium || "",
  MarginUsed: t.marginUsed || "",
  OTMPercentage: t.otmPercentage || "",
  Trend: t.trend,
  IVLevel: t.ivLevel,
  Notes: t.notes || ""
}));

const buildMonthlyRows = (trades) => {
  const closedTrades = trades.filter((t) => t.status === "CLOSED");
  return getMonthlyReportsData(closedTrades).map((r) => ({
    Month: `${r.monthName} ${r.year}`,
    Trades: r.trades,
    Wins: r.wins,
    Losses: r.losses,
    WinRate: `${r.winRate.toFixed(2)}%`,
    NetProfit: r.netProfit,
    BestTrade: r.bestTrade,
    WorstTrade: r.worstTrade,
    AverageTrade: r.avgTrade
  }));
};

export const exportTradesToXlsx = ({ trades, mode }) => {
  let filtered = [...trades];
  const now = new Date();

  if (mode === "open") filtered = filtered.filter((t) => t.status === "OPEN");
  if (mode === "closed") filtered = filtered.filter((t) => t.status === "CLOSED");

  if (mode === "current-month") {
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    filtered = filtered.filter((t) => toMonthYearKey(t.exitDate || t.entryDate) === key);
  }

  if (mode === "previous-month") {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    filtered = filtered.filter((t) => toMonthYearKey(t.exitDate || t.entryDate) === key);
  }

  const workbook = XLSX.utils.book_new();
  const tradeSheet = XLSX.utils.json_to_sheet(buildTradeRows(filtered));
  const monthlySheet = XLSX.utils.json_to_sheet(buildMonthlyRows(filtered));
  const analyticsSheet = XLSX.utils.json_to_sheet(getAnalyticsSummaryForExport(filtered));

  XLSX.utils.book_append_sheet(workbook, tradeSheet, "Trade Data");
  XLSX.utils.book_append_sheet(workbook, monthlySheet, "Monthly Summary");
  XLSX.utils.book_append_sheet(workbook, analyticsSheet, "Analytics Summary");

  XLSX.writeFile(workbook, fileNameWithDate(mode));
};

export const exportBackupJson = (state) => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tradevault_backup_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const parseImportFile = async (file) => {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "json") {
    const text = await file.text();
    return { type: "json", data: JSON.parse(text) };
  }

  if (ext === "xlsx" || ext === "xls") {
    const arrBuf = await file.arrayBuffer();
    const wb = XLSX.read(arrBuf, { type: "array" });
    const firstSheet = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet]);
    return { type: "xlsx", data: rows };
  }

  throw new Error("Unsupported import file type.");
};

export const normalizeXlsxRowsToTrades = (rows) => rows.map((r, idx) => ({
  id: `imported_${Date.now()}_${idx}`,
  status: String(r.Status || "OPEN").toUpperCase(),
  asset: r.Asset || "Others",
  assetDisplay: r.Asset || "Unknown",
  tradeType: r.TradeType || "Other",
  direction: r.Direction || "Equity Buy",
  positionDuration: r.PositionDuration || "Intraday",
  entryDate: r.EntryDate || "",
  entryPrice: Number(r.EntryPrice || 0),
  quantity: Number(r.Quantity || 0),
  strikePrice: r.StrikePrice || "",
  expiryDate: r.ExpiryDate || "",
  premium: r.Premium || "",
  marginUsed: r.MarginUsed || "",
  otmPercentage: r.OTMPercentage || "",
  trend: r.Trend || "Sideways",
  ivLevel: r.IVLevel || "Medium",
  notes: r.Notes || "",
  exitDate: r.ExitDate || "",
  exitPrice: Number(r.ExitPrice || 0),
  profitLoss: Number(r.ProfitLoss || 0),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}));
