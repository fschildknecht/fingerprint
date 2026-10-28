// Real-browser regression tests. Needs Chrome or Edge and a prior `npm run build`.
//   npm run test:browser            (auto-detects the browser)
//   CHROME_PATH=/path/to/chrome npm run test:browser
//
// Each browser is driven over the DevTools protocol. "Incognito" is a fresh off-the-record
// browser context, which has the same storage semantics as an incognito window.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = fileURLToPath(new URL('../..', import.meta.url));
if (!existsSync(join(root, 'packages/advanced/dist/index.global.js'))) {
  console.error('Build first: npm run build');
  process.exit(2);
}

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/microsoft-edge',
].filter(Boolean);
const browsers = [...new Set(CANDIDATES.filter((p) => existsSync(p)))];
if (!browsers.length) {
  console.log('No Chrome/Edge found, skipping browser tests (set CHROME_PATH).');
  process.exit(0);
}

const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  try {
    let p = new URL(req.url, 'http://x').pathname;
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) throw new Error('forbidden');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/examples/?mode=light`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    pending.get(d.id)?.(d);
  };
  const ready = new Promise((r) => (ws.onopen = r));
  return {
    async send(method, params = {}) {
      await ready;
      return new Promise((r) => {
        const i = ++id;
        pending.set(i, r);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    },
    close: () => ws.close(),
  };
}

async function evalPage(wsUrl, expression, pre = '') {
  const c = client(wsUrl);
  await c.send('Page.enable');
  await c.send('Page.navigate', { url });
  await sleep(1500);
  const r = await c.send('Runtime.evaluate', {
    expression: `(async()=>{${pre};return JSON.stringify(await (${expression}))})()`,
    awaitPromise: true,
    returnByValue: true,
    timeout: 90000,
  });
  c.close();
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return JSON.parse(r.result.result.value);
}

const ADV = (opts) =>
  `FingerprintAdvanced.getAdvanced(${JSON.stringify(opts)}).then(r=>({pm:r.analysis.privateMode,manip:r.analysis.manipulation,bot:r.analysis.bot}))`;

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) failed++;
};

for (const exe of browsers) {
  console.log(`\n${exe}`);
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = join(tmpdir(), 'fp-test-' + port);
  const proc = spawn(exe, [`--remote-debugging-port=${port}`, '--headless=new', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let version;
    for (let i = 0; i < 60 && !version; i++) {
      try {
        version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      } catch {
        await sleep(200);
      }
    }
    const browser = client(version.webSocketDebuggerUrl);
    const list = async () => (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const normal = (await list()).find((t) => t.type === 'page');
    const ctx = (await browser.send('Target.createBrowserContext')).result.browserContextId;
    const tid = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: ctx })).result.targetId;
    await sleep(500);
    const otr = (await list()).find((t) => t.id === tid);

    const n = await evalPage(normal.webSocketDebuggerUrl, ADV({ include: ['privateMode'] }));
    const o = await evalPage(otr.webSocketDebuggerUrl, ADV({ include: ['privateMode'] }));
    check('normal window is not private', n.pm.isPrivate === false, JSON.stringify(n.pm));
    check('incognito window is private', o.pm.isPrivate === true, JSON.stringify(o.pm));
    check('clean browser has no manipulation', n.manip.score < 0.15, JSON.stringify(n.manip.signals));

    const spoof = await evalPage(
      normal.webSocketDebuggerUrl,
      ADV({ include: ['canvas'] }),
      `Object.defineProperty(navigator,'platform',{get:()=>'iPhone'});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4})`,
    );
    check('spoofed navigator is flagged (>= 0.7)', spoof.manip.score >= 0.7, `score ${spoof.manip.score}`);
    check('spoof hits cross-context and tampering', ['cross-context', 'tampering'].every((c) => spoof.manip.categories[c]), JSON.stringify(spoof.manip.categories));
    browser.close();
  } catch (e) {
    check('browser run', false, String(e));
  } finally {
    proc.kill();
  }
}

server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll browser checks passed');
process.exit(failed ? 1 : 0);
