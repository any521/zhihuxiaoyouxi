/**
 * 灰盒原型双端自检脚本（只用于开发验证，不参与游戏逻辑）：
 * 1. PC 视口（1440×900）：BFS 寻路驱动机器人跑通「取简章 → 加工 → 交付」，抓控制台错误
 * 2. 手机视口（390×844）：验证布局不溢出、画布整数倍缩放
 * 3. 自动断言：PC 端 HUD 与画布**零重叠**（HUD 必须在黑边区）
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://127.0.0.1:5273/';
const OUT = resolve(process.cwd(), 'tools/shots');
const DELIVER_TARGET = 2;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function isWalkable(grid, col, row) {
  const value = grid[row]?.[col];
  return value === 0 || value === 2;
}

function bfs(grid, start, goal) {
  const key = (c, r) => `${c},${r}`;
  if (start.col === goal.col && start.row === goal.row) return [start];
  const queue = [start];
  const prev = new Map([[key(start.col, start.row), null]]);
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const [dc, dr] of steps) {
      const col = current.col + dc;
      const row = current.row + dr;
      if (!isWalkable(grid, col, row)) continue;
      const id = key(col, row);
      if (prev.has(id)) continue;
      const node = { col, row };
      prev.set(id, current);
      if (col === goal.col && row === goal.row) {
        const path = [];
        let cursor = node;
        while (cursor) {
          path.push(cursor);
          cursor = prev.get(key(cursor.col, cursor.row));
        }
        return path.reverse();
      }
      queue.push(node);
    }
  }
  return null;
}

/** HUD 与画布的重叠检测：PC 端必须为 0 */
async function measureLayout(page) {
  return page.evaluate(() => {
    const canvasEl = document.querySelector('.frame canvas');
    if (!canvasEl) return null;
    const canvas = canvasEl.getBoundingClientRect();
    const panels = [...document.querySelectorAll('.hud .panel')].map((el) => el.getBoundingClientRect());
    const overlapping = panels.filter(
      (p) => !(p.right <= canvas.left || p.left >= canvas.right || p.bottom <= canvas.top || p.top >= canvas.bottom),
    );
    // HUD 覆盖画布的面积占比（近似，忽略面板互相重叠）
    let covered = 0;
    for (const p of panels) {
      const w = Math.max(0, Math.min(p.right, canvas.right) - Math.max(p.left, canvas.left));
      const h = Math.max(0, Math.min(p.bottom, canvas.bottom) - Math.max(p.top, canvas.top));
      covered += w * h;
    }
    const canvasArea = canvas.width * canvas.height;
    return {
      canvas: { x: Math.round(canvas.x), y: Math.round(canvas.y), w: Math.round(canvas.width), h: Math.round(canvas.height) },
      panelCount: panels.length,
      overlapCount: overlapping.length,
      coverage: canvasArea > 0 ? Number((covered / canvasArea).toFixed(3)) : 0,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      debug: document.querySelector('.debug-tag')?.textContent ?? '',
      scale: window.__lksLayout?.scale ?? null,
    };
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const logs = [];
  const errors = [];
  const checks = [];

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });

  const newPage = async (width, height, isMobile) => {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile, hasTouch: isMobile });
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));
    page.on('requestfailed', (request) => errors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText}`));
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30_000 });
    await page.waitForSelector('.frame canvas', { timeout: 15_000 });
    await sleep(1000);
    return page;
  };

  const probeOf = (page) => page.evaluate(() => (window.__lksProbe ? window.__lksProbe() : null));

  /* ─────────────── PC 轮次：布局断言 + 机器人通关 ─────────────── */
  {
    const page = await newPage(1440, 900, false);
    const shot = async (name) => {
      await page.screenshot({ path: resolve(OUT, `pc-${name}.png`) });
    };

    await shot('01-start');
    const layoutBefore = await measureLayout(page);
    const startButton = await page.$('.modal button');
    await startButton.click();
    await sleep(700);
    await shot('02-level');

    const layout = await measureLayout(page);
    checks.push(`[PC] 画布 ${layout.canvas.w}×${layout.canvas.h} @ (${layout.canvas.x},${layout.canvas.y}) · ${layout.debug}`);
    checks.push(`[PC] 缩放倍率 ${layout.scale} → ${Number.isInteger(layout.scale) ? '整数倍 ✅' : '非整数 ❌'}`);
    checks.push(`[PC] 横版内部分辨率: ${layout.debug.includes('横版') ? '✅' : '❌'}`);
    checks.push(`[PC] HUD 面板 ${layout.panelCount} 个，与画布重叠 ${layout.overlapCount} 个 ${layout.overlapCount === 0 ? '✅' : '❌'}`);
    checks.push(`[PC] 横向溢出: ${layout.scrollWidth > layout.innerWidth ? '有 ❌' : '无 ✅'}`);
    checks.push(`[PC] 启动页布局: 重叠 ${layoutBefore.overlapCount} 个`);

    const hold = async (keys, ms) => {
      await Promise.all(keys.map((key) => page.keyboard.down(key)));
      await sleep(ms);
      await Promise.all(keys.map((key) => page.keyboard.up(key)));
    };

    const walkTo = async (tx, ty, budgetMs) => {
      const deadline = Date.now() + budgetMs;
      let stall = 0;
      let last = null;
      while (Date.now() < deadline) {
        const state = await probeOf(page);
        if (!state) return false;
        const dx = tx - state.x;
        const dy = ty - state.y;
        if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return true;
        if (last && Math.abs(state.x - last.x) < 0.6 && Math.abs(state.y - last.y) < 0.6) stall += 1;
        else stall = 0;
        last = { x: state.x, y: state.y };
        if (stall > 4) return false;
        const keys = [];
        if (dx > 5) keys.push('d');
        else if (dx < -5) keys.push('a');
        if (dy > 5) keys.push('s');
        else if (dy < -5) keys.push('w');
        if (keys.length === 0) return true;
        await hold(keys, 130);
      }
      return false;
    };

    const goTo = async (state, kind) => {
      const tile = state.tile;
      const goal = state.approaches[kind];
      const path = bfs(
        state.grid,
        { col: Math.floor(state.x / tile), row: Math.floor(state.y / tile) },
        { col: Math.floor(goal.x / tile), row: Math.floor(goal.y / tile) },
      );
      if (!path) return false;
      for (const step of path.slice(1)) {
        const ok = await walkTo(step.col * tile + tile / 2, step.row * tile + tile / 2, 4500);
        if (!ok) return await walkTo(goal.x, goal.y, 3000);
      }
      return walkTo(goal.x, goal.y, 2000);
    };

    let shots = 0;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const state = await probeOf(page);
      if (!state || state.finished || state.delivered >= DELIVER_TARGET) break;
      const kind = state.carrying === null ? 'shelf' : state.carrying === 'flyer' ? 'desk' : 'bin';
      if (!(await goTo(state, kind))) continue;
      const near = await probeOf(page);
      if (near?.binLocked && kind === 'bin') {
        await sleep(1500);
        continue;
      }
      await page.keyboard.press('Space');
      await sleep(260);
      if (kind === 'desk') {
        await sleep(400);
        if (shots === 0) await shot('03-processing');
        for (let i = 0; i < 16; i += 1) {
          const tick = await probeOf(page);
          if (!tick || tick.carrying === 'resume') break;
          await sleep(200);
        }
      }
      if (kind === 'bin') {
        const after = await probeOf(page);
        if (after?.delivered) {
          shots += 1;
          await shot(`04-delivered-${after.delivered}`);
        }
      }
    }

    const finalState = await probeOf(page);
    await shot('05-final');
    await page.evaluate(() => window.__lksStore?.getState().finish('A'));
    await sleep(500);
    await shot('06-result');
    checks.push(`[PC] 机器人结束状态: 交付 ${finalState?.delivered ?? '?'} 次, 时间剩 ${finalState?.timeLeft ?? '?'}s, 运行中=${finalState?.running}`);
    await page.close();
  }

  /* ─────────────── 手机轮次：布局断言 ─────────────── */
  {
    const page = await newPage(390, 844, true);
    const shot = async (name) => {
      await page.screenshot({ path: resolve(OUT, `m-${name}.png`) });
    };
    await shot('01-start');
    const startButton = await page.$('.modal button');
    await startButton.click();
    await sleep(700);
    await shot('02-level');

    const layout = await measureLayout(page);
    checks.push(`[手机] 画布 ${layout.canvas.w}×${layout.canvas.h} @ (${layout.canvas.x},${layout.canvas.y}) · ${layout.debug}`);
    checks.push(`[手机] 竖版内部分辨率: ${layout.debug.includes('竖版') ? '✅' : '❌'}`);
    checks.push(`[手机] 缩放倍率 ${layout.scale} → ${Number.isInteger(layout.scale) ? '整数倍 ✅（像素完美保住了）' : '非整数 ❌（会出现摩尔纹）'}`);
    checks.push(`[手机] HUD 面板 ${layout.panelCount} 个，覆盖画布 ${(layout.coverage * 100).toFixed(1)}% ${layout.coverage < 0.45 ? '✅（窄栏没埋住游戏）' : '❌（浮层过厚）'}`);
    checks.push(`[手机] 横向溢出: ${layout.scrollWidth > layout.innerWidth ? '有 ❌' : '无 ✅'}`);
    checks.push(`[手机] 画布在视口内: ${layout.canvas.x >= 0 && layout.canvas.y >= 0 ? '是 ✅' : '否 ❌'}`);

    // 触摸输入通路：验证 Phaser 是否收到触摸（原型尚未做虚拟摇杆，先确认不报错）
    await page.touchscreen.tap(layout.canvas.x + layout.canvas.w / 2, layout.canvas.y + layout.canvas.h / 2);
    await sleep(300);
    await shot('03-after-tap');
    await page.close();
  }

  const consoleErrors = logs.filter((line) => line.startsWith('[error]'));
  writeFileSync(
    resolve(OUT, 'log.txt'),
    `${checks.join('\n')}\n\n== CONSOLE ==\n${logs.join('\n')}\n\n== ERRORS ==\n${errors.join('\n')}\n`,
    'utf8',
  );
  console.log(checks.join('\n'));
  console.log('---');
  console.log('脚本级错误:', errors.length, errors.slice(0, 6).join(' | '));
  console.log('控制台 error 行:', consoleErrors.length);
  if (consoleErrors.length > 0) console.log(consoleErrors.slice(0, 5).join('\n'));

  await browser.close();
}

main().catch((error) => {
  console.error('自检失败:', error);
  process.exitCode = 1;
});
