// Minimal CDP driver: node test/shot.mjs <url> <out.png> [waitMs] [js-to-eval-after-load] [w] [h]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [url, out, waitMs = '6000', evalJs = '', W = '1400', H = '860', pre = ''] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'cdp-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  let target;
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json`); const j = await r.json(); target = j.find(t => t.type === 'page'); if (target) break; } catch (e) { } await sleep(200); }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result || d.error); pending.delete(d.id); }
    if (d.method === 'Runtime.consoleAPICalled') console.log('[console.' + d.params.type + ']', d.params.args.map(a => a.value ?? a.description).join(' '));
    if (d.method === 'Runtime.exceptionThrown') console.log('[exception]', d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
  if (pre) await send('Page.addScriptToEvaluateOnNewDocument', { source: pre });
  await send('Page.navigate', { url });
  await sleep(+waitMs);
  if (evalJs) {
    for (const step of evalJs.split(';;')) {
      const [code, wait] = step.split('@@');
      const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true });
      if (r?.result?.value !== undefined) console.log('[eval]', JSON.stringify(r.result.value));
      if (r?.exceptionDetails) console.log('[eval-exc]', r.exceptionDetails.exception?.description);
      await sleep(+(wait || 1500));
    }
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('saved', out);
} catch (e) { console.log('ERR', e); }
chrome.kill('SIGKILL');
process.exit(0);
