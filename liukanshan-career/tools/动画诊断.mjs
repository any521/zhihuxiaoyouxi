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
const b = await page.$(".modal button"); if (b) await b.click();
await sleep(500);
const info = await page.evaluate(() => {
  const g = window.__lksGame;
  const keys = g.textures.getTextureKeys();
  const s = g.scene.getScene("office");
  return {
    踏步帧存在: { 下: keys.includes("chr_lks_front_step"), 上: keys.includes("chr_lks_back_step") },
    动画列表: g.anims.anims.entries ? Object.keys(g.anims.anims.entries) : "?",
    上动画帧数: g.anims.get("主角_走_上")?.frames.length,
    下动画帧数: g.anims.get("主角_走_下")?.frames.length,
    npc贴图: s.npc.texture.key,
  };
});
console.log(JSON.stringify(info, null, 1));
// 连按 W 采样 6 次，看贴图是否在交替
await page.keyboard.down("w");
const 采样 = [];
for (let i = 0; i < 6; i++) {
  await sleep(90);
  采样.push(await page.evaluate(() => {
    const s = window.__lksGame.scene.getScene("office");
    return `${s.player.texture.key}${s.player.anims.isPlaying ? "" : "(停)"}`;
  }));
}
await page.keyboard.up("w");
console.log("按W时的贴图序列：" + 采样.join(" → "));
await page.keyboard.down("d");
const 采样2 = [];
for (let i = 0; i < 6; i++) {
  await sleep(90);
  采样2.push(await page.evaluate(() => window.__lksGame.scene.getScene("office").player.texture.key));
}
await page.keyboard.up("d");
console.log("按D时的贴图序列：" + 采样2.join(" → "));
await browser.close();
