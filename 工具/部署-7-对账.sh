#!/bin/bash
J='/%E5%88%98%E7%9C%8B%E5%B1%B1'
echo "--- 线上 index.html 实际引用的入口 js ---"
curl -sS "https://zjhxbb.xyz${J}/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
echo "--- 服务器磁盘上的文件（时间戳/大小）---"
ls -l --time-style=+%m-%d\ %H:%M /srv/liukanshan/*/assets/index-*.js
