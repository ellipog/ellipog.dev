/**
 * Renders the specimen sheets with headless Chrome over the DevTools protocol.
 *
 * Each shot is the real built page with `facesCss` + one direction's token overrides injected.
 * Reduced motion is emulated so the download figures are the settled, static values the server wrote,
 * and fonts are awaited before the shutter, so nothing is captured mid-swap.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { facesCss, directions } from './directions.mjs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const HERE = import.meta.dir;
const BASE = 'http://127.0.0.1:8791';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        (this.events.get(msg.method) ?? []).forEach((fn) => fn(msg.params));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  waitFor(event) {
    return new Promise((resolve) => {
      const list = this.events.get(event) ?? [];
      const once = (p) => {
        this.events.set(event, list.filter((f) => f !== once));
        resolve(p);
      };
      this.events.set(event, [...list, once]);
    });
  }
}

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${HERE}/.chrome`,
  `--remote-debugging-port=${PORT}`,
  'about:blank',
]);

async function waitForChrome() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome did not come up');
}

await waitForChrome();
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const cdp = new Cdp(ws);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');

const inject = (css) => `(async () => {
  document.head.insertAdjacentHTML('beforeend', '<style id="candidate">' + ${JSON.stringify(css)} + '</style>');
  await document.fonts.ready;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return document.fonts.status + ':' + [...document.fonts].filter(f => f.status === 'loaded').length;
})()`;

const override = (d) => `${facesCss}\n:root{\n${d.css}\n}`;

async function shot({ url, out, w = 1440, h = 1250, theme = 'light', css = '' }) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 1250, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const loaded = cdp.waitFor('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await loaded;
  await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      document.documentElement.setAttribute('data-theme', '${theme}');
      document.head.insertAdjacentHTML('beforeend', '<style id="candidate">' + ${JSON.stringify(css)} + '</style>');
      await document.fonts.ready;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      window.scrollTo(0, 0);
      return document.fonts.status + ' | loaded=' + [...document.fonts].filter(f => f.status === 'loaded').length;
    })()`,
    awaitPromise: true,
  });
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: w, height: h, scale: 2 },
  });
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`${out.split(/[\\/]/).pop()}  ${w}x${h}@2x`);
}

mkdirSync(`${HERE}/shots`, { recursive: true });
rmSync(`${HERE}/shots`, { recursive: true, force: true });
mkdirSync(`${HERE}/shots`, { recursive: true });

const HOME = `${BASE}/`;
const DOCS = `${BASE}/docs/tasked/design-preview/`;

for (const d of directions) {
  const css = override(d);
  await shot({ url: HOME, out: `${HERE}/shots/${d.id}-light.png`, h: 1250, theme: 'light', css });
  await shot({ url: HOME, out: `${HERE}/shots/${d.id}-dark.png`, h: 1000, theme: 'dark', css });
  await shot({ url: DOCS, out: `${HERE}/shots/${d.id}-docs.png`, h: 1150, theme: 'light', css });
}

// The axis studies: a purpose-built page, no injection -- it declares its own @font-face.
await shot({ url: `${BASE}/spec/axes.html`, out: `${HERE}/shots/axes.png`, h: 1560, theme: 'light', css: '' });

chrome.kill();
console.log('done');
