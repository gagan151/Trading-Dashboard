# IBKR Real-Time Data Setup

The dashboard is now ready to use Interactive Brokers for **real-time futures data**. Follow these steps when you're ready to switch:

## Prerequisites

1. **IBKR Account** (Paper or Live)
   - Sign up at [interactivebrokers.com](https://www.interactivebrokers.com)
   - Paper trading account is free for testing

2. **Market Data Subscriptions**
   - Log into IBKR Account Management
   - Subscribe to **CME Real-Time** data:
     - US Equity and Index Futures → **$10/month** (non-professional)
     - Or **FREE** with $10k+ account balance

3. **TWS or IB Gateway Installed**
   - Download from IBKR website
   - **TWS (Trader Workstation)**: Full GUI, easier for beginners
   - **IB Gateway**: Lightweight, no GUI (recommended for production)

## Setup Steps

### 1. Configure TWS/Gateway API Settings

Launch TWS or IB Gateway, then:

1. Go to **File → Global Configuration → API → Settings**
2. Enable the following:
   - ✅ **Enable ActiveX and Socket Clients**
   - ✅ **Allow connections from localhost only**
   - ✅ **Read-Only API** (recommended for safety)
3. Set **Socket port**:
   - TWS Paper: **7497**
   - TWS Live: **7496**
   - IB Gateway Paper: **4002**
   - IB Gateway Live: **4001**
4. Click **OK** and restart TWS/Gateway

### 2. Update Dashboard Config

Edit `src/config.js`:

```js
// Change this line:
DATA_SOURCE: 'yahoo',

// To:
DATA_SOURCE: 'ibkr',
```

Optionally update connection settings if needed:

```js
IBKR_HOST: '127.0.0.1',
IBKR_PORT: 7497, // Use your port from step 1
IBKR_CLIENT_ID: 1,
```

### 3. Rebuild & Launch

```bash
npm run build
```

Launch the dashboard — it will now connect to IBKR for **real-time data**!

## Contract Rollover

The dashboard automatically uses the **front month contract**:
- March, June, September, December
- Auto-calculates based on current date

If you need to manually override, edit `_getFrontMonth()` in `src/data-feed-ibkr.js`.

## Troubleshooting

### Connection Failed
- ✅ Is TWS/Gateway running?
- ✅ Is the API enabled in settings?
- ✅ Is the port correct in `config.js`?
- ✅ Check TWS logs: **File → Log Viewer**

### No Data
- ✅ Do you have CME market data subscribed?
- ✅ Is the market open? (Futures trade nearly 24/5)
- ✅ Check console logs in the dashboard

### "Not Connected" Warnings
- IBKR limits to **50 simultaneous historical data requests**
- The dashboard respects this and caches data

## Cost Summary

| Account Type | Market Data Cost |
|-------------|------------------|
| < $10k balance | $10/month |
| ≥ $10k balance | **FREE** |
| Professional | ~$140/month |

## Switching Back to Yahoo Finance

Just change `config.js`:

```js
DATA_SOURCE: 'yahoo',
```

No rebuild needed — restart the app.
