# ICT Trading Dashboard — NQ & ES

Real-time ICT concepts dashboard for day trading NQ and ES futures during the NY session.

## Quick Start

```bash
# 1. Install dependencies (Python 3.10+ required)
pip install -r requirements.txt

# 2. Run the dashboard
python app.py

# 3. Open in browser
# http://localhost:8000
```

## Features

- **Kill Zones** — Asia, London, NY AM, NY Lunch, NY PM with countdown timers
- **Key Levels** — PDH/PDL/PDO/PDC, PWH/PWL/PWO/PWC with proximity alerts
- **Liquidity Sweeps** — Asia/London/PDH/PDL swept vs unswept during NY session
- **Key Opens** — 18:00, 00:00, 09:30, 10:00, 13:00 open prices
- **ICT Macro Times** — 9:50, 10:50, 1:50, 2:50 windows with active indicator
- **OTE Levels** — Swing detection + 0.618 / 0.705 / 0.786 Fibonacci retracement
- **Power of 3** — Accumulation / Manipulation / Distribution phase detection

## Data Source

Yahoo Finance via `yfinance`. Data may be delayed ~15-20 minutes for futures.
The architecture supports swapping to a real-time broker API by replacing `data_feed.py`.

## Configuration

Edit `config.py` to customize:
- Kill zone times
- Macro time windows
- Key open times
- OTE Fibonacci levels
- Proximity threshold
- Poll interval
