module.exports = {
  TICKERS: ['NQ=F', 'ES=F'],
  TICKER_LABELS: { 'NQ=F': 'NQ', 'ES=F': 'ES' },
  POLL_INTERVAL: 30, // seconds

  KILL_ZONES: [
    { name: 'Asia',     start: [19, 0], end: [0, 0],  crossesMidnight: true },
    { name: 'London',   start: [2, 0],  end: [5, 0],  crossesMidnight: false },
    { name: 'NY AM',    start: [9, 30], end: [12, 0], crossesMidnight: false },
    { name: 'NY Lunch', start: [12, 0], end: [13, 0], crossesMidnight: false },
    { name: 'NY PM',    start: [13, 0], end: [16, 0], crossesMidnight: false },
  ],

  MACRO_TIMES: [
    { label: '9:50\u201310:10',  start: [9, 50],  end: [10, 10] },
    { label: '10:50\u201311:10', start: [10, 50], end: [11, 10] },
    { label: '1:50\u20132:10',   start: [13, 50], end: [14, 10] },
    { label: '2:50\u20133:10',   start: [14, 50], end: [15, 10] },
  ],

  KEY_OPENS: [
    { label: '18:00 Futures Open',  hour: 18, minute: 0 },
    { label: '00:00 Midnight Open', hour: 0,  minute: 0 },
    { label: '09:30 NY Open',       hour: 9,  minute: 30 },
    { label: '10:00 True Open',     hour: 10, minute: 0 },
    { label: '13:00 PM Open',       hour: 13, minute: 0 },
  ],

  OTE_FIBS: [0.618, 0.705, 0.786],
  PROXIMITY_PCT: 0.001,
  SWING_LOOKBACK: 5,
};
