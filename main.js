const { app, BrowserWindow } = require('electron');
const path = require('path');
const DataFeed = require('./src/data-feed');
const ICTEngine = require('./src/ict-engine');
const config = require('./src/config');

// prevent GPU-related crashes
app.disableHardwareAcceleration();

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

let win = null;
const feed = new DataFeed();
const engine = new ICTEngine();

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b0b11',
    title: 'ICT Dashboard',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

async function poll() {
  try {
    const data = await feed.fetchAll();
    const metrics = engine.compute(data);
    if (win && !win.isDestroyed()) {
      win.webContents.send('update', metrics);
    }
  } catch (err) {
    console.error('Poll error:', err.message);
  }
}

app.whenReady().then(() => {
  createWindow();
  
  // window opens immediately, start fetching data in background
  win.webContents.on('did-finish-load', () => {
    poll(); // initial fetch
    setInterval(poll, config.POLL_INTERVAL * 1000);
  });
});

app.on('window-all-closed', () => app.quit());
