#!/usr/bin/env bash
# Render a Hebrew (RTL) Markdown doc to a print-ready PDF.
#
#   ./scripts/md-to-pdf.sh SYSTEM_OVERVIEW.md "מערכת-תהילה-סקירה-מלאה"
#
# Exists so the PDF is regenerated FROM the markdown rather than maintained
# alongside it — the two drifting apart is how documentation starts lying.
#
# Requires: npx (fetches `marked` on demand) and Microsoft Edge.

set -euo pipefail

SRC="${1:?usage: md-to-pdf.sh <file.md> [output-name]}"
OUT="${2:-$(basename "${SRC%.md}")}"
TMP="$(mktemp -d)"
# Edge keeps a lock on its headless profile briefly after exiting, so cleanup
# is best-effort — a leftover temp dir is not worth failing the build over.
trap 'rm -rf "$TMP" 2>/dev/null || true' EXIT

EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
[ -f "$EDGE" ] || EDGE="/c/Program Files/Microsoft/Edge/Application/msedge.exe"

npx --yes marked -i "$SRC" -o "$TMP/body.html"

cat > "$TMP/doc.html" <<'HEAD'
<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;800&family=Assistant:wght@400;600;700&display=swap">
<style>
 :root{--ink:#191C20;--soft:#4F555C;--faint:#868C94;--rule:#DFDDD6;
       --firm:#C2BFB6;--accent:#1F4E5F;--accent-bg:#EDF3F5;}
 @page{size:A4;margin:14mm 12mm;}
 body{margin:0;background:#fff;color:var(--ink);direction:rtl;
      font-family:"Assistant","Segoe UI",system-ui,sans-serif;font-size:10.5pt;line-height:1.6;}
 h1{font-family:"Frank Ruhl Libre",Georgia,serif;font-weight:800;font-size:24pt;
    margin:0 0 6pt;padding-bottom:10pt;border-bottom:3px double var(--firm);}
 h2{font-family:"Frank Ruhl Libre",Georgia,serif;font-size:15pt;font-weight:700;
    margin:18pt 0 4pt;padding-bottom:3pt;border-bottom:1.5pt solid var(--accent);
    break-after:avoid;page-break-after:avoid;}
 h3{font-size:11pt;font-weight:700;margin:12pt 0 3pt;color:var(--accent);
    break-after:avoid;page-break-after:avoid;}
 h4{font-size:10pt;font-weight:700;margin:9pt 0 2pt;}
 p{margin:0 0 7pt;}
 table{width:100%;border-collapse:collapse;font-size:9pt;margin:6pt 0 10pt;
       break-inside:avoid;page-break-inside:avoid;}
 th{background:var(--accent-bg);color:var(--accent);font-weight:700;font-size:8.5pt;
    padding:4pt 5pt;text-align:start;border-bottom:1.2pt solid var(--firm);}
 td{padding:4pt 5pt;border-bottom:.6pt solid var(--rule);vertical-align:top;}
 tr:last-child td{border-bottom:0;}
 code{font-family:Consolas,monospace;font-size:8.5pt;background:#F0EFEB;
      padding:.5pt 3pt;direction:ltr;display:inline-block;}
 pre{background:#F6F5F1;border:1pt solid var(--rule);padding:7pt 9pt;font-size:8pt;
     direction:ltr;text-align:left;white-space:pre-wrap;font-family:Consolas,monospace;
     line-height:1.45;break-inside:avoid;page-break-inside:avoid;}
 pre code{background:none;padding:0;font-size:8pt;}
 blockquote{margin:7pt 0;padding:7pt 10pt;background:#FBF2E6;
            border-inline-start:3pt solid #9A5B1E;break-inside:avoid;}
 blockquote p{margin:0 0 4pt;} blockquote p:last-child{margin:0;}
 ul,ol{margin:0 0 7pt;padding-inline-start:15pt;} li{margin-bottom:2.5pt;}
 hr{border:0;border-top:1pt solid var(--rule);margin:14pt 0;}
 em{color:var(--faint);}
</style></head><body>
HEAD

cat "$TMP/body.html" >> "$TMP/doc.html"
echo '</body></html>' >> "$TMP/doc.html"

WINTMP="$(cygpath -w "$TMP/doc.html" 2>/dev/null || echo "$TMP/doc.html")"
"$EDGE" --headless --disable-gpu --virtual-time-budget=20000 \
        --print-to-pdf="$(pwd)/$OUT.pdf" "$WINTMP" 2>/dev/null

sleep 3
if [ -f "$OUT.pdf" ]; then
  echo "created: $OUT.pdf ($(du -h "$OUT.pdf" | cut -f1))"
else
  echo "FAILED — no PDF produced" >&2; exit 1
fi
