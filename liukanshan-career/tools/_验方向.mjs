import puppeteer from "puppeteer-core";
const EDGE="C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const b=await puppeteer.launch({executablePath:EDGE,headless:"new",args:["--no-sandbox","--enable-unsafe-swiftshader","--use-angle=swiftshader"]});
const p=await b.newPage(); await p.setCacheEnabled(false); await p.setViewport({width:1440,height:900});
await p.goto("http://127.0.0.1:5273/?f="+Date.now(),{waitUntil:"networkidle2"});
await p.waitForFunction(()=>typeof window.__lksStory==="function",{timeout:20000}); await new Promise(r=>setTimeout(r,700));
await p.evaluate(()=>window.__lksStory.setState({屏幕:'map',段号:1}));
await p.waitForFunction(()=>!!window.__lksMap,{timeout:20000}); await new Promise(r=>setTimeout(r,900));
const r = await p.evaluate(()=>{
  const s=window.__lksMap; const out=[];
  // (24,4) 是空工位（段1里 24,4 没人）—— 试四个方向
  const 四方向 = [[24,3,'上'],[24,5,'下'],[25,4,'右'],[23,4,'左']];
  for (const [x,y,名] of 四方向) {
    s.站起来(); const px=s.格到像素(x,y); s.传送像素(px.x,px.y);
    const ok=s.坐下(); const 座=s.坐的座位;
    out.push({方向:名, 站:`${x},${y}`, 坐:ok, 选中:座?`${座.x},${座.y} ${座.家具}`:'—'});
  }
  s.站起来();
  return out;
});
for (const o of r) console.log(`${o.方向} 站(${o.站}) → 坐=${String(o.坐).padEnd(5)} 选中=${o.选中}`);
await b.close();
