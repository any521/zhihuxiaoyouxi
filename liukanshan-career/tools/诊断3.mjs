import puppeteer from "puppeteer-core";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sleep = (ms) => new Promise((d) => setTimeout(d, ms));
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true,
  args: ["--no-sandbox","--enable-unsafe-swiftshader","--use-angle=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
await page.goto("http://127.0.0.1:5273/", { waitUntil: "networkidle2" });
await page.waitForSelector(".frame canvas");
await sleep(1200);
const btn = await page.$(".modal button"); if (btn) await btn.click();
await sleep(600);
const probe = () => page.evaluate(() => window.__lksProbe());
const 站 = await probe();
console.log("工位坐标：", JSON.stringify(站.stations));
console.log("可站立点：", JSON.stringify(站.approaches));
console.log("场景尺寸：", 站.tile, "瓦片；地图 cols=", 站.grid[0].length, "rows=", 站.grid.length);
console.log("");
for (const kind of ["shelf","desk","bin"]) {
  const 结果 = await page.evaluate((k) => {
    const s = window.__lksGame.scene.getScene("office");
    const p = window.__lksProbe().approaches[k];
    s.player.setPosition(p.x, p.y);
    s.player.body.reset(p.x, p.y);
    const st = window.__lksProbe();
    const 目标 = st.stations[k];
    const d = Math.hypot(st.x - 目标.x, st.y - 目标.y);
    return { 瞬移到: p, 实际位置: {x: Math.round(st.x), y: Math.round(st.y)}, 到工位距离: Math.round(d), nearest: st.nearest };
  }, k);
  console.log(`${kind}:`, JSON.stringify(结果));
}
await browser.close();
