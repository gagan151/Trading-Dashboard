"""ICT Trading Dashboard — Configuration"""

# Tickers
TICKERS = ["NQ=F", "ES=F"]
TICKER_LABELS = {"NQ=F": "NQ", "ES=F": "ES"}

# Poll interval (seconds)
POLL_INTERVAL = 30

# Timezone
TIMEZONE = "US/Eastern"

# Kill Zones — (name, start_hour, start_min, end_hour, end_min, crosses_midnight)
KILL_ZONES = [
    {"name": "Asia",     "start": (19, 0),  "end": (0, 0),   "crosses_midnight": True},
    {"name": "London",   "start": (2, 0),   "end": (5, 0),   "crosses_midnight": False},
    {"name": "NY AM",    "start": (9, 30),  "end": (12, 0),  "crosses_midnight": False},
    {"name": "NY Lunch", "start": (12, 0),  "end": (13, 0),  "crosses_midnight": False},
    {"name": "NY PM",    "start": (13, 0),  "end": (16, 0),  "crosses_midnight": False},
]

# ICT Macro Times
MACRO_TIMES = [
    {"label": "9:50–10:10",  "start": (9, 50),  "end": (10, 10)},
    {"label": "10:50–11:10", "start": (10, 50), "end": (11, 10)},
    {"label": "1:50–2:10",   "start": (13, 50), "end": (14, 10)},
    {"label": "2:50–3:10",   "start": (14, 50), "end": (15, 10)},
]

# Key Open Times (label, hour, minute)
KEY_OPENS = [
    {"label": "18:00 Futures Open",  "hour": 18, "minute": 0},
    {"label": "00:00 Midnight Open", "hour": 0,  "minute": 0},
    {"label": "09:30 NY Open",       "hour": 9,  "minute": 30},
    {"label": "10:00 True Open",     "hour": 10, "minute": 0},
    {"label": "13:00 PM Open",       "hour": 13, "minute": 0},
]

# OTE Fibonacci levels
OTE_FIBS = [0.618, 0.705, 0.786]

# Proximity threshold (0.1%)
PROXIMITY_PCT = 0.001

# Swing lookback for pivot detection (bars on each side, 5-min chart)
SWING_LOOKBACK = 5
