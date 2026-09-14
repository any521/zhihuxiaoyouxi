#!/bin/bash
# 刘看山小游戏 —— 部署第 3 步：验证（自己的站 + 别人的项目回归）
# ⚠️ 请求用百分号编码的 ASCII 形式发（避免脚本本身的编码问题）；
#    nginx 匹配的是解码后的 URI，所以和中文原形等价。
set -uo pipefail

L=/srv/liukanshan
D="${L}/$(printf '\xe5\x88\x98\xe7\x9c\x8b\xe5\xb1\xb1')"
J='/%E5%88%98%E7%9C%8B%E5%B1%B1'
JS=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' "${D}/index.html" | head -1)

echo "════ 我的站 ════"
curl -sS -o /dev/null -w "  /刘看山        -> %{http_code}\n"           "https://zjhxbb.xyz${J}"
curl -sS -o /dev/null -w "  /刘看山/       -> %{http_code} %{content_type} %{size_download}B\n" "https://zjhxbb.xyz${J}/"
echo "  入口 js: ${JS}"
curl -sS -o /dev/null -w "  入口 js        -> %{http_code} %{size_download}B\n" "https://zjhxbb.xyz${J}/${JS}"
curl -sS -o /dev/null -w "  中文音频       -> %{http_code} %{size_download}B\n" "https://zjhxbb.xyz${J}/audio/%E6%8C%87%E6%A0%87%E4%B8%8A%E5%8D%87.wav"
curl -sS -o /dev/null -w "  BGM            -> %{http_code} %{size_download}B\n" "https://zjhxbb.xyz${J}/audio/bgm/bgm_%E5%B7%A5%E4%BD%9C%E5%85%B3.wav"
curl -sS -o /dev/null -w "  中文像素字体   -> %{http_code} %{size_download}B\n" "https://zjhxbb.xyz${J}/fonts/ark-pixel-12px-zh_cn.woff2"
curl -sS -o /dev/null -w "  地图贴图       -> %{http_code} %{size_download}B\n" "https://zjhxbb.xyz${J}/assets/map/chr_lks_walk.png"
curl -sS -o /dev/null -w "  不存在的路径   -> %{http_code}（应为 200：SPA 回退到 index.html）\n" "https://zjhxbb.xyz${J}/不存在的路径"

echo
echo "════ 别人的项目（回归：一个都不能坏）════"
curl -sS -o /dev/null -w "  主站 /                 -> %{http_code}\n" "https://zjhxbb.xyz/"
curl -sS -o /dev/null -w "  点废成金               -> %{http_code}\n" "https://zjhxbb.xyz/%E7%82%B9%E5%BA%9F%E6%88%90%E9%87%91/"
curl -sS -o /dev/null -w "  点废成金 /api/         -> %{http_code}\n" "https://zjhxbb.xyz/%E7%82%B9%E5%BA%9F%E6%88%90%E9%87%91/api/"
curl -sS -o /dev/null -w "  点废成金 /admin/       -> %{http_code}\n" "https://zjhxbb.xyz/%E7%82%B9%E5%BA%9F%E6%88%90%E9%87%91/admin/"
curl -sS -o /dev/null -w "  dsh 子域               -> %{http_code}\n" "https://dsh.zjhxbb.xyz/"
curl -sS -o /dev/null -w "  IP 直连（默认站点）     -> %{http_code}\n" "http://47.120.12.99/"
echo
echo "  —— 本机服务是否都还在 ——"
for p in 3080 3095 3000 3099; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 "http://127.0.0.1:${p}/" 2>/dev/null || echo "无响应")
  echo "    127.0.0.1:${p} -> ${code}"
done
echo
echo "  —— nginx 与配置状态 ——"
systemctl is-active nginx
nginx -t 2>&1 | tail -1
ls -l /etc/nginx/agrimind-common.conf.bak-liukanshan-* 2>/dev/null | tail -1
