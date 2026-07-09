# Trading Dashboard

A lightweight, fast, cross-platform (macOS + Windows) desktop app for ICT-style
trading of **NQ=F** (E-mini Nasdaq-100) and **ES=F** (E-mini S&P 500) index
futures: live price, kill zones, ICT macro times, Asia/London/Previous-Day/
Previous-Week high & low sweep detection with native OS notifications, market
session status, financial news, and an economic events feed.

Built with **Tauri 2** (Rust core + native webview), **React + TypeScript +
Vite**, **TailwindCSS**, and **TradingView Lightweight Charts**.

> Data is from Yahoo Finance (unofficial, personal-use, possibly delayed) and
> Finnhub (optional, free tier). This app is informational/analytical only — not
> for real-money execution decisions.

## Features

- **Live prices + streaming candlestick charts** for NQ and ES (5m candles,
  New York time axis), via the Yahoo Finance WebSocket decoded in Rust.
- **ICT kill zones** (Asia, London Open, NY AM, London Close, NY PM) shown as
  chart bands + an active-session indicator. All times are ET (auto DST).
- **ICT macro windows** (~20 min) with active/done/upcoming status and a live
  countdown to the next macro.
- **Liquidity sweep detection**: tracks Asia/London highs & lows and Previous
  Day / Previous Week highs & lows per symbol. The moment a locked level is
  taken out, a native OS notification fires and the Liquidity panel updates
  (swept ✓ / unswept, with sweep time).
- **Market status**: CME Globex open/closed + US cash session indicator.
- **News + economic calendar**: Yahoo headlines (clickable, open in your
  browser) + a Finnhub economic calendar with impact, time, and forecast vs
  actual.
- **Settings** (gear icon): toggle sweep notifications, chart overlays
  (kill-zone / macro bands / level lines), and per-symbol visibility. Persisted
  locally.

## Getting started (development)

Requires Node.js, Rust (`rustup`), and the Tauri prerequisites for your OS
(macOS: Xcode CLT; Windows: WebView2 + MSVC build tools).

```bash
npm install
npm run tauri dev      # launch the native window in dev mode
```

Build checks:

```bash
npm run build          # tsc + vite (frontend)
cargo check --manifest-path src-tauri/Cargo.toml   # Rust
```

## Economic calendar (optional)

The calendar uses **Finnhub** (free API key). Without a key the calendar shows a
hint and the rest of the app works normally. To enable it, set the env var
before launching:

```bash
export FINNHUB_API_KEY=your_free_finnhub_key
npm run tauri dev
```

The events provider sits behind a trait (`src-tauri/src/news/`) so it can be
swapped for Trading Economics / ForexFactory without touching the UI.

## Building installers

### macOS (from macOS)

```bash
npm run tauri build
# → src-tauri/target/release/bundle/{macos,dmg}/
```

Universal binary (Apple Silicon + Intel):

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

### Windows (from Windows)

```bash
npm run tauri build
# → src-tauri/target/release/bundle/{msi,nsis}/
```

Tauri Windows builds rely on the WebView2 evergreen runtime (preinstalled on
Windows 10/11). Cross-compiling Windows from macOS is not supported; use a
Windows machine or the included CI workflow.

### CI (GitHub Actions)

`.github/workflows/release.yml` builds macOS (aarch64 + x86_64) and Windows
installers on `v*` tags and attaches them to a GitHub Release via
`tauri-action`. Set `FINNHUB_API_KEY` in repo Secrets to enable the calendar in
CI builds. The workflow activates once this project is its own repository (or is
at the repo root).

## Tech & data sources

- **Tauri 2** — native webview shell (WKWebView on macOS, WebView2 on Windows),
  small Rust core, tiny binaries, low RAM, fast cold start.
- **Yahoo Finance** — live ticks from the protobuf WebSocket
  (`wss://streamer.finance.yahoo.com`); history + snapshots from the chart REST
  endpoint (cookie + crumb, gentle 10s polling); news from
  `/v1/finance/search`. The WebSocket needs no auth and is the primary live path.
- **Finnhub** — optional economic calendar (free tier, `FINNHUB_API_KEY`).
- **TradingView Lightweight Charts** v5 — canvas candlestick charts with
  streaming `series.update()`.

## Attribution

Charts are powered by [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
(Apache-2.0). Attribution is displayed in-app as required by the license.

## Project structure

```
src/                      React + TS frontend
  components/             TopBar, PriceCard, ChartPane, LiquidityPanel,
                         SessionMacroPanel, NewsEventsPanel, SettingsPanel
  hooks/                  useStream, useIct, useNewsEvents, useSettings
  lib/                    tauri wrappers, types, format, settings, symbols
src-tauri/src/            Rust core
  yahoo/                  rest.rs, ws.rs, proto.rs (Yahoo data service)
  ict.rs                  ICT engine: sessions, macros, levels, sweeps
  news/                   mod.rs, yahoo.rs, finnhub.rs (news + econ provider)
  service.rs, commands.rs, lib.rs
```
