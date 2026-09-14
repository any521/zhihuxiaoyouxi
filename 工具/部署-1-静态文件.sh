#!/bin/bash
# 刘看山小游戏 —— 部署第 1 步：把静态文件放到 /srv/liukanshan/<中文目录>/
#
# ⚠️ 两个坑，都是实测踩出来的：
#    一、**中文目录名一律用 printf 的 UTF-8 十六进制构造**，不靠命令行传中文 ——
#        Windows -> plink 这条路上中文很容易被转成别的编码，然后就成了另一个目录名。
#    二、**bash 不允许中文变量名**（`名=...` 会被当成命令，报 "command not found"），
#        所以脚本里变量名全用 ASCII。
set -euo pipefail

# 刘看山 = e5 88 98 / e7 9c 8b / e5 b1 b1
name=$(printf '\xe5\x88\x98\xe7\x9c\x8b\xe5\xb1\xb1')
root=/srv/liukanshan
target="${root}/${name}"
stage="${root}/.stage-$(date +%s)"

echo "目标目录: ${target}"
echo -n "（十六进制目视）: "; printf '%s' "${target}" | od -An -tx1

# ① 先解到临时目录（**解包失败也不会动线上那一份**）
rm -rf "${stage}"
mkdir -p "${stage}"
tar -xzf /tmp/lks-dist.tar.gz -C "${stage}"
echo "新版本文件数: $(find "${stage}" -type f | wc -l)"

# ② 同步到目标目录
#    ⚠️ 用 rsync --delete：**哈希文件名每次部署都变**，不删旧的会在服务器上越堆越多。
#       （没有 rsync 就退回直接覆盖 —— 只是会留垃圾，不会坏。）
mkdir -p "${target}"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "${stage}/" "${target}/"
  echo "已用 rsync --delete 同步（旧哈希产物已清掉）"
else
  cp -a "${stage}/." "${target}/"
  echo "（没有 rsync，直接覆盖）"
fi
rm -rf "${stage}"

echo
echo "=== 内容 ==="
ls -la "${target}" | head -12
echo "文件总数: $(find "${target}" -type f | wc -l)"
du -sh "${target}"
