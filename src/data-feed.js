const config = require('./config');

let _yf = null;
async function yf() {
  if (!_yf) {
    const mod = await import('yahoo-finance2');
    const YahooFinance = mod.default;
    _yf = new YahooFinance();
  }
  return _yf;
}

class DataFeed {
  constructor() {
    this._dailyCache = {};
    this._dailyTs = 0;
    this._weeklyCache = {};
    this._weeklyTs = 0;
  }

  async fetchIntraday() {
    const out = {};
    const period1 = new Date();
    period1.setDate(period1.getDate() - 5);

    const yahooFinance = await yf();
    for (const ticker of config.TICKERS) {
      try {
        const res = await yahooFinance.chart(ticker, {
          period1,
          interval: '1m',
          includePrePost: true,
        });
        if (res?.quotes?.length) out[ticker] = res.quotes;
      } catch (e) {
        console.warn(`Intraday ${ticker}:`, e.message);
      }
    }
    return out;
  }

  async fetchDaily() {
    if (Date.now() - this._dailyTs < 300_000) return this._dailyCache;
    const out = {};
    const period1 = new Date();
    period1.setDate(period1.getDate() - 30);

    const yahooFinance = await yf();
    for (const ticker of config.TICKERS) {
      try {
        const res = await yahooFinance.chart(ticker, { period1, interval: '1d' });
        if (res?.quotes?.length) out[ticker] = res.quotes;
      } catch (e) {
        console.warn(`Daily ${ticker}:`, e.message);
      }
    }
    this._dailyCache = out;
    this._dailyTs = Date.now();
    return out;
  }

  async fetchWeekly() {
    if (Date.now() - this._weeklyTs < 1_800_000) return this._weeklyCache;
    const out = {};
    const period1 = new Date();
    period1.setDate(period1.getDate() - 90);

    const yahooFinance = await yf();
    for (const ticker of config.TICKERS) {
      try {
        const res = await yahooFinance.chart(ticker, { period1, interval: '1wk' });
        if (res?.quotes?.length) out[ticker] = res.quotes;
      } catch (e) {
        console.warn(`Weekly ${ticker}:`, e.message);
      }
    }
    this._weeklyCache = out;
    this._weeklyTs = Date.now();
    return out;
  }

  async fetchAll() {
    const [intraday, daily, weekly] = await Promise.all([
      this.fetchIntraday(),
      this.fetchDaily(),
      this.fetchWeekly(),
    ]);
    return { intraday, daily, weekly };
  }
}

module.exports = DataFeed;
