"""ICT Concepts calculation engine."""

from datetime import datetime, time, timedelta

import pandas as pd
import pytz

from config import (
    KEY_OPENS,
    KILL_ZONES,
    MACRO_TIMES,
    OTE_FIBS,
    PROXIMITY_PCT,
    SWING_LOOKBACK,
    TICKER_LABELS,
    TICKERS,
    TIMEZONE,
)

ET = pytz.timezone(TIMEZONE)


# ── helpers ──────────────────────────────────────────────────────────
def _mins(h: int, m: int) -> int:
    return h * 60 + m


def _countdown(minutes: int) -> str:
    if minutes <= 0:
        return ""
    h, m = divmod(int(minutes), 60)
    return f"{h}h {m}m" if h else f"{m}m"


def _near(price: float | None, level: float | None) -> bool:
    if price is None or level is None or level == 0:
        return False
    return abs(price - level) / abs(level) <= PROXIMITY_PCT


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        if pd.isna(v):
            return None
        return v
    except (TypeError, ValueError):
        return None


# ── engine ───────────────────────────────────────────────────────────
class ICTEngine:

    def compute(self, data: dict) -> dict:
        now = datetime.now(ET)
        intraday = data.get("intraday", {})
        daily = data.get("daily", {})
        weekly = data.get("weekly", {})

        result = {
            "time": now.strftime("%I:%M:%S %p"),
            "date": now.strftime("%A, %b %d"),
            "kill_zones": self._kill_zones(now),
            "macros": self._macros(now),
            "tickers": {},
        }

        for ticker in TICKERS:
            label = TICKER_LABELS.get(ticker, ticker)
            intra = intraday.get(ticker, pd.DataFrame())
            day = daily.get(ticker, pd.DataFrame())
            week = weekly.get(ticker, pd.DataFrame())

            price = None
            if not intra.empty:
                price = round(float(intra["Close"].iloc[-1]), 2)

            # daily change
            daily_change = 0.0
            if not day.empty and price is not None:
                prev_close = self._prev_day_close(day, now)
                if prev_close:
                    daily_change = round(((price - prev_close) / prev_close) * 100, 2)

            # levels (raw floats first)
            levels_raw = self._key_levels(day, week, now)
            liquidity = self._liquidity_sweeps(intra, levels_raw, now)
            ote = self._ote(intra, price, now)
            key_opens = self._key_opens(intra, price, now)
            po3 = self._power_of_3(intra, now)

            # decorate levels with proximity flags
            levels = {}
            for k, v in levels_raw.items():
                levels[k] = {"value": v, "near": _near(price, v)}

            result["tickers"][ticker] = {
                "label": label,
                "price": price,
                "daily_change": daily_change,
                "levels": levels,
                "liquidity": liquidity,
                "ote": ote,
                "key_opens": key_opens,
                "po3": po3,
            }

        return result

    # ── kill zones ───────────────────────────────────────────────────
    def _kill_zones(self, now: datetime) -> list[dict]:
        now_m = _mins(now.hour, now.minute)
        out = []
        for kz in KILL_ZONES:
            s = _mins(*kz["start"])
            e = _mins(*kz["end"])
            name = kz["name"]

            if kz.get("crosses_midnight"):
                if now_m >= s or now_m < e:
                    rem = (1440 - now_m + e) if now_m >= s else (e - now_m)
                    out.append({"name": name, "status": "ACTIVE", "countdown": _countdown(rem), "active": True})
                else:
                    rem = s - now_m if now_m < s else (1440 - now_m + s)
                    out.append({"name": name, "status": "upcoming", "countdown": _countdown(rem), "active": False})
            else:
                if s <= now_m < e:
                    out.append({"name": name, "status": "ACTIVE", "countdown": _countdown(e - now_m), "active": True})
                elif now_m < s:
                    out.append({"name": name, "status": "upcoming", "countdown": _countdown(s - now_m), "active": False})
                else:
                    out.append({"name": name, "status": "closed", "countdown": "", "active": False})
        return out

    # ── macro times ──────────────────────────────────────────────────
    def _macros(self, now: datetime) -> list[dict]:
        now_m = _mins(now.hour, now.minute)
        out = []
        for m in MACRO_TIMES:
            s = _mins(*m["start"])
            e = _mins(*m["end"])
            if s <= now_m < e:
                out.append({"label": m["label"], "status": "ACTIVE", "countdown": _countdown(e - now_m), "active": True})
            elif now_m < s:
                out.append({"label": m["label"], "status": "upcoming", "countdown": _countdown(s - now_m), "active": False})
            else:
                out.append({"label": m["label"], "status": "closed", "countdown": "", "active": False})
        return out

    # ── previous-day close ───────────────────────────────────────────
    @staticmethod
    def _prev_day_close(daily: pd.DataFrame, now: datetime) -> float | None:
        if daily.empty:
            return None
        last = daily.index[-1]
        last_date = last.date() if hasattr(last, "date") else last
        if isinstance(last_date, datetime):
            last_date = last_date.date()
        idx = -2 if last_date >= now.date() and len(daily) >= 2 else -1
        if abs(idx) > len(daily):
            return None
        return _safe_float(daily["Close"].iloc[idx])

    # ── key levels ───────────────────────────────────────────────────
    def _key_levels(self, daily: pd.DataFrame, weekly: pd.DataFrame, now: datetime) -> dict:
        levels: dict[str, float | None] = {}

        if not daily.empty:
            last = daily.index[-1]
            last_date = last.date() if hasattr(last, "date") else last
            if isinstance(last_date, datetime):
                last_date = last_date.date()
            idx = -2 if last_date >= now.date() and len(daily) >= 2 else (-1 if len(daily) >= 1 else None)
            if idx is not None and abs(idx) <= len(daily):
                r = daily.iloc[idx]
                levels["pdh"] = round(float(r["High"]), 2)
                levels["pdl"] = round(float(r["Low"]), 2)
                levels["pdo"] = round(float(r["Open"]), 2)
                levels["pdc"] = round(float(r["Close"]), 2)

        if not weekly.empty and len(weekly) >= 2:
            r = weekly.iloc[-2]
            levels["pwh"] = round(float(r["High"]), 2)
            levels["pwl"] = round(float(r["Low"]), 2)
            levels["pwo"] = round(float(r["Open"]), 2)
            levels["pwc"] = round(float(r["Close"]), 2)

        return levels

    # ── liquidity sweeps ─────────────────────────────────────────────
    def _liquidity_sweeps(self, intra: pd.DataFrame, levels: dict, now: datetime) -> list[dict]:
        if intra.empty:
            return []

        today = now.date()
        yesterday = today - timedelta(days=(3 if today.weekday() == 0 else 1))

        ny_start = ET.localize(datetime.combine(today, time(9, 30)))
        ny_data = intra[intra.index >= ny_start]

        sessions = [
            ("Asia High",   yesterday, time(19, 0), today, time(0, 0),  "high"),
            ("Asia Low",    yesterday, time(19, 0), today, time(0, 0),  "low"),
            ("London High", today,     time(2, 0),  today, time(5, 0),  "high"),
            ("London Low",  today,     time(2, 0),  today, time(5, 0),  "low"),
        ]

        out: list[dict] = []
        for label, sd, st, ed, et_, side in sessions:
            try:
                s_dt = ET.localize(datetime.combine(sd, st))
                e_dt = ET.localize(datetime.combine(ed, et_))
                if e_dt <= s_dt:
                    e_dt += timedelta(days=1)
                seg = intra[(intra.index >= s_dt) & (intra.index < e_dt)]
                if seg.empty:
                    out.append({"label": label, "level": None, "swept": False, "status": "N/A"})
                    continue
                if side == "high":
                    lvl = round(float(seg["High"].max()), 2)
                    swept = (not ny_data.empty) and float(ny_data["High"].max()) > lvl
                else:
                    lvl = round(float(seg["Low"].min()), 2)
                    swept = (not ny_data.empty) and float(ny_data["Low"].min()) < lvl
                out.append({"label": label, "level": lvl, "swept": swept, "status": "SWEPT" if swept else "Unswept"})
            except Exception:
                out.append({"label": label, "level": None, "swept": False, "status": "N/A"})

        # PDH / PDL sweeps
        for key, side in [("pdh", "high"), ("pdl", "low")]:
            val = levels.get(key)
            if val is None:
                continue
            if side == "high":
                swept = (not ny_data.empty) and float(ny_data["High"].max()) > val
            else:
                swept = (not ny_data.empty) and float(ny_data["Low"].min()) < val
            out.append({"label": key.upper(), "level": val, "swept": swept, "status": "SWEPT" if swept else "Unswept"})

        return out

    # ── OTE ──────────────────────────────────────────────────────────
    def _ote(self, intra: pd.DataFrame, price: float | None, now: datetime) -> dict:
        if intra.empty or price is None:
            return {"available": False}
        try:
            df5 = (
                intra.resample("5min")
                .agg({"Open": "first", "High": "max", "Low": "min", "Close": "last"})
                .dropna()
            )
            n = SWING_LOOKBACK
            if len(df5) < n * 2 + 1:
                return {"available": False}

            highs = df5["High"].values
            lows = df5["Low"].values

            swing_highs, swing_lows = [], []
            for i in range(n, len(highs) - n):
                if highs[i] == max(highs[i - n : i + n + 1]):
                    swing_highs.append((i, float(highs[i])))
                if lows[i] == min(lows[i - n : i + n + 1]):
                    swing_lows.append((i, float(lows[i])))

            if not swing_highs or not swing_lows:
                return {"available": False}

            sh_idx, sh = swing_highs[-1]
            sl_idx, sl = swing_lows[-1]
            rng = sh - sl
            if rng <= 0:
                return {"available": False}

            result: dict = {
                "available": True,
                "swing_high": round(sh, 2),
                "swing_low": round(sl, 2),
                "levels": {},
            }

            if sh_idx > sl_idx:
                # Most-recent pivot is a HIGH → bullish move completed → OTE for long entry
                result["direction"] = "bullish"
                for fib in OTE_FIBS:
                    lvl = round(sh - rng * fib, 2)
                    result["levels"][str(fib)] = {"price": lvl, "near": _near(price, lvl)}
                ote_top = round(sh - rng * OTE_FIBS[0], 2)
                ote_bot = round(sh - rng * OTE_FIBS[-1], 2)
                result["in_ote"] = ote_bot <= price <= ote_top
            else:
                # Most-recent pivot is a LOW → bearish move completed → OTE for short entry
                result["direction"] = "bearish"
                for fib in OTE_FIBS:
                    lvl = round(sl + rng * fib, 2)
                    result["levels"][str(fib)] = {"price": lvl, "near": _near(price, lvl)}
                ote_bot = round(sl + rng * OTE_FIBS[0], 2)
                ote_top = round(sl + rng * OTE_FIBS[-1], 2)
                result["in_ote"] = ote_bot <= price <= ote_top

            return result
        except Exception:
            return {"available": False}

    # ── key opens ────────────────────────────────────────────────────
    def _key_opens(self, intra: pd.DataFrame, price: float | None, now: datetime) -> list[dict]:
        if intra.empty:
            return [{"label": ko["label"], "price": None, "near": False} for ko in KEY_OPENS]

        today = now.date()
        out: list[dict] = []

        for ko in KEY_OPENS:
            h, m = ko["hour"], ko["minute"]
            label = ko["label"]
            open_price = None

            if h == 18:
                # Most recent 18:00 candle before now
                match = intra[(intra.index.hour == h) & (intra.index.minute == m) & (intra.index <= now)]
                if not match.empty:
                    open_price = _safe_float(match.iloc[-1]["Open"])
            elif h == 0:
                # Today's midnight
                target = ET.localize(datetime.combine(today, time(0, 0)))
                seg = intra[(intra.index >= target) & (intra.index < target + timedelta(minutes=2))]
                if not seg.empty:
                    open_price = _safe_float(seg.iloc[0]["Open"])
            else:
                # Intraday opens for today
                target = ET.localize(datetime.combine(today, time(h, m)))
                if now >= target:
                    seg = intra[(intra.index >= target) & (intra.index < target + timedelta(minutes=2))]
                    if not seg.empty:
                        open_price = _safe_float(seg.iloc[0]["Open"])

            if open_price is not None:
                open_price = round(open_price, 2)

            out.append({
                "label": label,
                "price": open_price,
                "near": _near(price, open_price),
            })

        return out

    # ── power of 3 ───────────────────────────────────────────────────
    def _power_of_3(self, intra: pd.DataFrame, now: datetime) -> dict:
        if intra.empty:
            return {"available": False}

        today = now.date()
        ny_open_dt = ET.localize(datetime.combine(today, time(9, 30)))
        ny_data = intra[intra.index >= ny_open_dt]

        if ny_data.empty:
            return {"available": False}

        try:
            ny_open = round(float(ny_data["Open"].iloc[0]), 2)
            session_high = round(float(ny_data["High"].max()), 2)
            session_low = round(float(ny_data["Low"].min()), 2)

            elapsed = (now - ny_open_dt).total_seconds() / 60

            if elapsed < 30:
                return {
                    "available": True,
                    "ny_open": ny_open,
                    "high": session_high,
                    "low": session_low,
                    "phase": "Accumulation",
                    "bias": "Neutral",
                }

            # Accumulation range (first 30 min)
            accum_end = ny_open_dt + timedelta(minutes=30)
            accum = ny_data[ny_data.index < accum_end]
            if accum.empty:
                return {"available": True, "ny_open": ny_open, "high": session_high, "low": session_low, "phase": "Accumulation", "bias": "Neutral"}

            accum_h = float(accum["High"].max())
            accum_l = float(accum["Low"].min())
            accum_rng = accum_h - accum_l if accum_h != accum_l else 1.0
            buf = accum_rng * 0.10

            swept_high = session_high > accum_h + buf
            swept_low = session_low < accum_l - buf
            current = float(ny_data["Close"].iloc[-1])

            if swept_low and current > ny_open:
                phase, bias = "Distribution", "Bullish"
            elif swept_high and current < ny_open:
                phase, bias = "Distribution", "Bearish"
            elif swept_high:
                phase, bias = "Manipulation", "Bearish"
            elif swept_low:
                phase, bias = "Manipulation", "Bullish"
            else:
                phase, bias = "Accumulation", "Neutral"

            return {
                "available": True,
                "ny_open": ny_open,
                "high": session_high,
                "low": session_low,
                "phase": phase,
                "bias": bias,
            }
        except Exception:
            return {"available": False}
