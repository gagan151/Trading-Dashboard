"""Yahoo Finance data feed with caching."""

import logging
from datetime import datetime

import pandas as pd
import pytz
import yfinance as yf

from config import TICKERS, TIMEZONE

logger = logging.getLogger(__name__)
ET = pytz.timezone(TIMEZONE)


class DataFeed:
    def __init__(self):
        self._daily_cache: dict[str, pd.DataFrame] = {}
        self._weekly_cache: dict[str, pd.DataFrame] = {}
        self._daily_ts: datetime | None = None
        self._weekly_ts: datetime | None = None

    # ------------------------------------------------------------------
    def fetch_intraday(self) -> dict[str, pd.DataFrame]:
        """1-min candles for the last 5 days (max 7d for 1m on yfinance)."""
        out: dict[str, pd.DataFrame] = {}
        for ticker in TICKERS:
            try:
                df = yf.Ticker(ticker).history(
                    period="5d", interval="1m", prepost=True
                )
                if df.empty:
                    continue
                # Ensure ET timezone
                if df.index.tz is not None:
                    df.index = df.index.tz_convert(ET)
                else:
                    df.index = df.index.tz_localize(ET)
                out[ticker] = df
            except Exception as e:
                logger.warning("Intraday fetch failed for %s: %s", ticker, e)
        return out

    # ------------------------------------------------------------------
    def fetch_daily(self) -> dict[str, pd.DataFrame]:
        """Daily candles, cached for 5 minutes."""
        now = datetime.now()
        if self._daily_ts and (now - self._daily_ts).total_seconds() < 300:
            return self._daily_cache

        out: dict[str, pd.DataFrame] = {}
        for ticker in TICKERS:
            try:
                df = yf.Ticker(ticker).history(period="1mo", interval="1d")
                if not df.empty:
                    out[ticker] = df
            except Exception as e:
                logger.warning("Daily fetch failed for %s: %s", ticker, e)

        self._daily_cache = out
        self._daily_ts = now
        return out

    # ------------------------------------------------------------------
    def fetch_weekly(self) -> dict[str, pd.DataFrame]:
        """Weekly candles, cached for 30 minutes."""
        now = datetime.now()
        if self._weekly_ts and (now - self._weekly_ts).total_seconds() < 1800:
            return self._weekly_cache

        out: dict[str, pd.DataFrame] = {}
        for ticker in TICKERS:
            try:
                df = yf.Ticker(ticker).history(period="3mo", interval="1wk")
                if not df.empty:
                    out[ticker] = df
            except Exception as e:
                logger.warning("Weekly fetch failed for %s: %s", ticker, e)

        self._weekly_cache = out
        self._weekly_ts = now
        return out

    # ------------------------------------------------------------------
    def fetch_all(self) -> dict:
        return {
            "intraday": self.fetch_intraday(),
            "daily": self.fetch_daily(),
            "weekly": self.fetch_weekly(),
        }
