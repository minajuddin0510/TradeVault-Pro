import { safeParseJSON } from "./utils.js";

const STORAGE_KEY = "tradevault_pro_state_v1";

const defaultState = {
  username: "",
  theme: {
    accent: "blue"
  },
  trades: []
};

export const store = {
  getState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = safeParseJSON(raw || "", defaultState);
    return {
      ...defaultState,
      ...parsed,
      theme: { ...defaultState.theme, ...(parsed.theme || {}) },
      trades: Array.isArray(parsed.trades) ? parsed.trades : []
    };
  },

  saveState(nextState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  },

  reset() {
    localStorage.removeItem(STORAGE_KEY);
  }
};

export const createTrade = (tradeInput) => ({
  id: `tr_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
  status: "OPEN",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...tradeInput
});
