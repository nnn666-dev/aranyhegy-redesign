#!/bin/bash
set -e
cd /Users/zotya/aranyhegy-redesign-2027/opus
mkdir -p img shots
cp ../img/*.jpg img/
for f in img/*.jpg; do
  echo "$f $(sips -g pixelWidth -g pixelHeight "$f" | awk '/pixel/{print $2}' | tr '\n' 'x') $(du -k "$f" | cut -f1)KB"
done
which magick convert montage node 2>/dev/null || true
ls "/Applications/Google Chrome.app/Contents/MacOS/" 2>/dev/null
