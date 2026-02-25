const { IBApiNext, Contract, BarSizeSetting } = require('@stoqey/ib');
const config = require('./config');

class IBKRDataFeed {
  constructor() {
    this.ib = new IBApiNext({
      host: config.IBKR_HOST,
      port: config.IBKR_PORT,
      clientId: config.IBKR_CLIENT_ID,
    });

    this.connected = false;
    this.contracts = {
      'NQ=F': { symbol: 'NQ', secType: 'FUT', exchange: 'CME', currency: 'USD', lastTradeDateOrContractMonth: this._getFrontMonth() },
      'ES=F': { symbol: 'ES', secType: 'FUT', exchange: 'CME', currency: 'USD', lastTradeDateOrContractMonth: this._getFrontMonth() }
    };

    this._dailyCache = {};
    this._dailyTs = 0;
    this._weeklyCache = {};
    this._weeklyTs = 0;

    this._setupConnection();
  }

  _getFrontMonth() {
    // Get the front month contract (e.g., "202503" for March 2025)
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    // Futures roll typically mid-quarter (Mar, Jun, Sep, Dec)
    const quarterMonths = [3, 6, 9, 12];
    let targetMonth = quarterMonths.find(m => m >= month) || quarterMonths[0];
    let targetYear = targetMonth < month ? year + 1 : year;
    return `${targetYear}${String(targetMonth).padStart(2, '0')}`;
  }

  async _setupConnection() {
    try {
      await this.ib.connect();
      this.connected = true;
      console.log('[IBKR] Connected to TWS/Gateway');
    } catch (err) {
      console.error('[IBKR] Connection failed:', err.message);
      this.connected = false;
    }
  }

  async fetchIntraday() {
    if (!this.connected) {
      console.warn('[IBKR] Not connected, skipping intraday fetch');
      return {};
    }

    const out = {};
    
    for (const [ticker, contractDef] of Object.entries(this.contracts)) {
      try {
        const contract = new Contract(
          contractDef.symbol,
          contractDef.secType,
          contractDef.exchange,
          contractDef.currency,
          contractDef.lastTradeDateOrContractMonth
        );

        // Request 5 days of 1-min bars
        const bars = await this.ib.reqHistoricalData(
          contract,
          '', // endDateTime (empty = now)
          '5 D', // duration
          BarSizeSetting.MINUTES_ONE,
          'TRADES',
          1, // regular trading hours only
          1, // dateFormat: 1 = yyyyMMdd HH:mm:ss
          false // keepUpToDate
        );

        // Convert IBKR bars to yahoo-finance2 format for compatibility
        out[ticker] = bars.map(bar => ({
          date: new Date(bar.time * 1000),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume
        }));

      } catch (e) {
        console.warn(`[IBKR] Intraday ${ticker}:`, e.message);
      }
    }

    return out;
  }

  async fetchDaily() {
    if (Date.now() - this._dailyTs < 300_000) return this._dailyCache;
    if (!this.connected) {
      console.warn('[IBKR] Not connected, skipping daily fetch');
      return this._dailyCache;
    }

    const out = {};

    for (const [ticker, contractDef] of Object.entries(this.contracts)) {
      try {
        const contract = new Contract(
          contractDef.symbol,
          contractDef.secType,
          contractDef.exchange,
          contractDef.currency,
          contractDef.lastTradeDateOrContractMonth
        );

        const bars = await this.ib.reqHistoricalData(
          contract,
          '',
          '30 D',
          BarSizeSetting.DAYS_ONE,
          'TRADES',
          1,
          1,
          false
        );

        out[ticker] = bars.map(bar => ({
          date: new Date(bar.time * 1000),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume
        }));

      } catch (e) {
        console.warn(`[IBKR] Daily ${ticker}:`, e.message);
      }
    }

    this._dailyCache = out;
    this._dailyTs = Date.now();
    return out;
  }

  async fetchWeekly() {
    if (Date.now() - this._weeklyTs < 1_800_000) return this._weeklyCache;
    if (!this.connected) {
      console.warn('[IBKR] Not connected, skipping weekly fetch');
      return this._weeklyCache;
    }

    const out = {};

    for (const [ticker, contractDef] of Object.entries(this.contracts)) {
      try {
        const contract = new Contract(
          contractDef.symbol,
          contractDef.secType,
          contractDef.exchange,
          contractDef.currency,
          contractDef.lastTradeDateOrContractMonth
        );

        const bars = await this.ib.reqHistoricalData(
          contract,
          '',
          '90 D',
          BarSizeSetting.WEEKS_ONE,
          'TRADES',
          1,
          1,
          false
        );

        out[ticker] = bars.map(bar => ({
          date: new Date(bar.time * 1000),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume
        }));

      } catch (e) {
        console.warn(`[IBKR] Weekly ${ticker}:`, e.message);
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

  disconnect() {
    if (this.connected) {
      this.ib.disconnect();
      this.connected = false;
      console.log('[IBKR] Disconnected');
    }
  }
}

module.exports = IBKRDataFeed;
