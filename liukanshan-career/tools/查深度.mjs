
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 700));
await p.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 段号: 2, NPC排布号: 2 }));
await p.waitForFunction(() => !!window.__lksMap && !!window.__lksMap.scene?.isActive?.(), { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1200));
const 出 = await p.evaluate(() => {
  const 场 = window.__lksMap;
  const 区域 = (x, y) => x >= 3 * 32 && x <= 10 * 32 && y >= 3 * 32 && y <= 9 * 32;
  const 行 = [];
  for (const o of 场.children.list) {
    if (typeof o.x !== 'number') continue;
    if (!区域(o.x, o.y)) continue;
    const 图 = o.texture?.key ?? o.type;
    行.push({ 图, x: Math.round(o.x), y: Math.round(o.y), 深: o.depth, 名: o.getData?.('名') ?? '' });
  }
  行.sort((a, b2) => a.深 - b2.深);
  // 顺手把 NPC 单独列一下
  const NPC = (场.NPC们 ?? []).map((s) => ({ 名: s.getData('名'), x: Math.round(s.x), y: Math.round(s.y), 深: s.depth, 图: s.texture.key }));
  return { 行, NPC };
});
console.log('=== 会议室A 区域（按深度从后到前）===');
for (const r of 出.行) console.log(`  深 ${String(r.深).padStart(6)}  ${r.名 || ''} ${r.图}  @(${r.x},${r.y})`);
console.log('');
console.log('=== NPC ===');
for (const n of 出.NPC) console.log(`  ${n.名} ${n.图} @(${n.x},${n.y}) 深 ${n.深}`);
await b.close();
