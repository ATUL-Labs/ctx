'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const platform = os.platform();

const WIN_PATHS = [
  // Chrome
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
  // Edge
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  // Brave
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  // Vivaldi
  'C:\\Program Files\\Vivaldi\\Application\\vivaldi.exe',
  'C:\\Program Files (x86)\\Vivaldi\\Application\\vivaldi.exe',
];

const MAC_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const LINUX_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/usr/bin/brave-browser',
  '/usr/bin/vivaldi',
  '/snap/bin/chromium',
];

function findBrowser() {
  const paths = platform === 'win32' ? WIN_PATHS
    : platform === 'darwin' ? MAC_PATHS
    : LINUX_PATHS;

  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const name = p.toLowerCase().includes('edge') ? 'Edge'
          : p.toLowerCase().includes('brave') ? 'Brave'
          : p.toLowerCase().includes('vivaldi') ? 'Vivaldi'
          : p.toLowerCase().includes('chromium') ? 'Chromium'
          : 'Chrome';
        return { path: p, name };
      }
    } catch {}
  }

  // WSL: try Windows Chrome via /mnt/c
  if (platform === 'linux' && fs.existsSync('/mnt/c')) {
    for (const wp of WIN_PATHS) {
      const wslPath = '/mnt/c' + wp.replace(/\\/g, '/').replace('C:', '');
      try {
        if (fs.existsSync(wslPath)) {
          return { path: wslPath, name: 'Chrome (WSL)' };
        }
      } catch {}
    }
  }

  return null;
}

module.exports = { findBrowser };
