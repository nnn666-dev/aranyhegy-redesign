#!/bin/bash
# Make web-sized derivatives (originals kept in img/)
cd /Users/zotya/aranyhegy-redesign-2027/opus/img
mkdir -p w1800 w900
for f in *.jpg; do
  sips -Z 1800 -s formatOptions 72 "$f" --out "w1800/$f" >/dev/null
  sips -Z 900 -s formatOptions 70 "$f" --out "w900/$f" >/dev/null
done
du -sh . w1800 w900
