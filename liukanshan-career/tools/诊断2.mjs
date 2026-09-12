import puppeteer from "puppeteer-core";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sleep = (ms) => new Promise((d) => setTimeout(d, ms));
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true,
  args: ["--no-sandbox","--enable-unsafe-swiftshader","--use-angle=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
await page.goto("http://127.0.0.1:5273/", { waitUntil: "networkidle2" });
await page.waitForSelector(".frame canvas");
await sleep(1200);
const btn = await page.$(".modal button"); if (btn) await btn.click();
await sleep(800);
const r = await page.evaluate(() => {
  const game = window.__lksGame;
  const scene = game.scene.getScene("office");
  const keys = new Set(game.textures.getTextureKeys());
  return scene.children.list.map((o) => ({
    type: o.type,
    tex: o.texture?.key ?? "",
    缺失: o.texture?.key ? !keys.has(o.texture.key) : null,
    vis: o.visible, x: Math.round(o.x ?? 0), y: Math.round(o.y ?? 0),
    w: Math.round(o.displayWidth ?? 0), h: Math.round(o.displayHeight ?? 0),
  })).filter((o) => o.x > 100 && o.x < 400 && o.y > 100 && o.y < 250);
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
