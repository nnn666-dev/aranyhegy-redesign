#!/bin/bash
cd /Users/zotya/aranyhegy-redesign-2027/opus
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mk() { # name, files...
  name=$1; shift
  {
  echo '<html><body style="margin:0;background:#111;color:#fff;font:bold 22px sans-serif;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px">'
  for f in "$@"; do echo "<div><img src=\"../img/$f\" style=\"width:100%;height:300px;object-fit:contain;background:#000\"><div>$f</div></div>"; done
  echo '</body></html>'
  } > shots/_$name.html
  "$CH" --headless=new --hide-scrollbars --virtual-time-budget=5000 --window-size=1600,700 --screenshot=shots/_$name.png "file://$PWD/shots/_$name.html" 2>/dev/null
}
cd img; A=(*.jpg); cd ..
mk s1 "${A[@]:0:8}"
mk s2 "${A[@]:8:8}"
mk s3 "${A[@]:16:8}"
mk s4 "${A[@]:24:8}"
ls -la shots
