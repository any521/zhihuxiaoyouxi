#!/bin/bash
# 清掉上一版遗留的哈希产物（index.html 已经不再引用的 index-*.js/css）
set -uo pipefail
name=$(printf '\xe5\x88\x98\xe7\x9c\x8b\xe5\xb1\xb1')
dir="/srv/liukanshan/${name}"
cd "${dir}" || exit 1
kept=0; gone=0
for f in assets/index-*.js assets/index-*.css; do
  [ -e "$f" ] || continue
  if grep -q "$(basename "$f")" index.html; then
    kept=$((kept+1))
  else
    rm -f "$f"; gone=$((gone+1)); echo "  删掉旧产物: $f"
  fi
done
echo "保留 $kept 个（index.html 正在引用的），删掉 $gone 个"
echo "现在文件总数: $(find "${dir}" -type f | wc -l)  占用: $(du -sh "${dir}" | cut -f1)"
ls -la assets/index-* 2>/dev/null
