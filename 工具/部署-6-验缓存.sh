#!/bin/bash
set -uo pipefail
J='/%E5%88%98%E7%9C%8B%E5%B1%B1'
echo "--- 行走图（用户刚重新生成的素材，必须 no-cache）---"
curl -sSI "https://zjhxbb.xyz${J}/assets/map/chr_lu_walk.png" | grep -iE 'HTTP/|cache-control|expires|last-modified'
echo
echo "--- 哈希产物（必须长缓存）---"
F=$(ls /srv/liukanshan/*/assets/index-*.js | head -1 | xargs basename)
echo "  文件: $F"
curl -sSI "https://zjhxbb.xyz${J}/assets/$F" | grep -iE 'HTTP/|cache-control'
echo
echo "--- 服务器上行走图的时间/大小 ---"
ls -l /srv/liukanshan/*/assets/map/chr_*_walk.png
