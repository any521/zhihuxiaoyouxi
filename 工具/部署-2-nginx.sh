#!/bin/bash
# 刘看山小游戏 —— 部署第 2 步：接进 nginx
#   ⚠️ 原则：**先备份、先 nginx -t，通过了才 reload**；任何一步不对就回滚，绝不留半个配置。
set -uo pipefail

conf=/etc/nginx/agrimind-common.conf
frag=/etc/nginx/liukanshan-locations.conf

echo "=== 0) 落 nginx 片段 ==="
cp -a /tmp/lks-nginx.conf "${frag}"
ls -l "${frag}"
echo "--- 片段里的中文路径（十六进制目视）---"
grep -n "location /" "${frag}" | head -4

echo
echo "=== 1) 备份主配置 ==="
if grep -q 'liukanshan-locations.conf' "${conf}"; then
  echo "include 已经在了，跳过插入"
else
  bak="${conf}.bak-liukanshan-$(date +%Y%m%d_%H%M%S)"
  cp -a "${conf}" "${bak}"
  echo "备份 -> ${bak}"
  awk '{print} /dianfei-locations\.conf/ && !done {print "include /etc/nginx/liukanshan-locations.conf;"; done=1}' "${conf}" > "${conf}.new"
  if grep -q 'liukanshan-locations.conf' "${conf}.new"; then
    mv "${conf}.new" "${conf}"
    echo "已插入 include"
  else
    rm -f "${conf}.new"
    echo "✗ 没找到插入点（dianfei 那行不见了？）—— 保持原样不动"
    exit 3
  fi
fi
echo "--- 现在的 include 区 ---"
grep -nE '^include ' "${conf}"

echo
echo "=== 2) nginx -t ==="
if nginx -t 2>&1; then
  echo "✓ 配置语法通过"
else
  echo "✗ 语法不过 —— 回滚"
  if [ -n "${bak:-}" ] && [ -f "${bak}" ]; then cp -a "${bak}" "${conf}"; echo "已回滚 ${conf}"; fi
  exit 4
fi

echo
echo "=== 3) reload nginx（reload 是平滑的，不会断掉别的项目）==="
systemctl reload nginx
sleep 1
systemctl is-active nginx
echo "--- 现在还在监听的（确认别的服务没被碰）---"
ss -lntp | grep -E ':80 |:443 ' | head -4
