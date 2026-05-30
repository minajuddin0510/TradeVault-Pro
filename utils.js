export const formatCurrency = (value) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(num);
};

export const formatNumber = (value, digits = 2) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toFixed(digits) : "0.00";
};

export const toDateInputValue = (date = new Date()) => {
  const yr = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${day}`;
};

export const toMonthYearKey = (dateStr) => {
  if (!dateStr) return "Unknown";
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

export const monthLabel = (dateStr) => {
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return dt.toLocaleDateString("en-US", { month: "long" });
};

export const yearLabel = (dateStr) => {
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return String(dt.getFullYear());
};

export const daysBetween = (fromDate, toDate = new Date()) => {
  if (!fromDate) return 0;
  const a = new Date(fromDate);
  const b = new Date(toDate);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const diff = Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 0);
};

export const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

export const unique = (arr) => [...new Set(arr.filter(Boolean))];

export const safeParseJSON = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return fallback;
  }
};
