#!/usr/bin/env bash
# Every icon from the two logo sources (spec feat-phone-inline §P29): assets/brand/app-icon.png (the mark on its deep
# purple sky, 1024) and assets/brand/mark.svg (the mark alone). Needs ImageMagick (magick) and rsvg-convert.
# Run after changing a source, then commit what it wrote; `pnpm exec cap sync android` is not needed for res/.
set -euo pipefail
cd "$(dirname "$0")/.."
ICON=assets/brand/app-icon.png
MARK=assets/brand/mark.svg
PURPLE='#3D034E' # the picture's sky at its edges
SKY="radial-gradient:#56106E-$PURPLE"
DARK='#0B0716' # the app's own background (start screen)
CREAM='#FEFEDC' # the picture's sticker border
RES=android/app/src/main/res
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mark() { # mark <px> <out.png>: the mark alone, transparent around it
  rsvg-convert -w "$1" -h "$1" "$MARK" -o "$2"
}
sticker() { # sticker <px> <out.png>: the mark with the picture's die-cut border (cream, thin dark edge), as in app-icon.png
  local px=$1 r=$(( $1 / 40 + 1 ))
  mark "$px" "$TMP/raw.png"
  magick "$TMP/raw.png" -bordercolor none -border $(( r * 2 )) \
    \( +clone -alpha extract -morphology Dilate "Disk:$(( r * 2 ))" -background '#141414' -alpha shape \) \
    \( -clone 0 -alpha extract -morphology Dilate "Disk:$(( r * 2 - r / 2 - 1 ))" -background "$CREAM" -alpha shape \) \
    -delete 0 -background none -compose Over -flatten \
    \( "$TMP/raw.png" -bordercolor none -border $(( r * 2 )) \) -compose Over -composite \
    -resize "${px}x${px}" "$2"
}
on_sky() { # on_sky <size> <mark fraction %> <out.png> [round]: the mark centred on the purple sky
  local size=$1 m=$(( $1 * $2 / 100 ))
  sticker "$m" "$TMP/m.png"
  magick -size "${size}x${size}" "$SKY" "$TMP/m.png" -gravity center -composite "$TMP/s.png"
  if [ "${4:-}" = round ]; then
    magick "$TMP/s.png" \( -size "${size}x${size}" xc:none -fill white -draw "circle $((size / 2)),$((size / 2)) $((size / 2)),0" \) \
      -compose DstIn -composite "$3"
  else
    cp "$TMP/s.png" "$3"
  fi
}

# Web app (manifest + index.html) and the zapstore listing (icon-512).
magick "$ICON" -resize 192x192 public/icons/icon-192.png
magick "$ICON" -resize 512x512 public/icons/icon-512.png
magick "$ICON" -resize 180x180 public/icons/apple-touch-icon.png
on_sky 512 68 public/icons/icon-maskable-512.png # inside the 80 % circle a mask may keep
cp "$MARK" public/favicon.svg

# Android launcher: the old square icon is the picture; the round one and the adaptive layers keep the mark inside
# the safe zone (66 of 108 dp) so a circle or squircle mask does not cut its points.
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  dpi=${d%%:*} px=${d##*:} fg=$(( ${d##*:} * 108 / 48 ))
  magick "$ICON" -resize "${px}x${px}" "$RES/mipmap-$dpi/ic_launcher.png"
  on_sky "$px" 72 "$RES/mipmap-$dpi/ic_launcher_round.png" round
  sticker $(( fg * 54 / 100 )) "$TMP/fg.png"
  magick -size "${fg}x${fg}" xc:none "$TMP/fg.png" -gravity center -composite "$RES/mipmap-$dpi/ic_launcher_foreground.png"
done
cat > "$RES/values/ic_launcher_background.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$PURPLE</color>
</resources>
XML

# Android start screen: the mark on the app's dark background, each splash at the size it already has.
for f in "$RES"/drawable*/splash.png; do
  read -r w h < <(magick identify -format '%w %h\n' "$f")
  short=$(( w < h ? w : h ))
  sticker $(( short * 30 / 100 )) "$TMP/sp.png"
  magick -size "${w}x${h}" "xc:$DARK" "$TMP/sp.png" -gravity center -composite "$f"
done
echo "Icons written: public/icons, public/favicon.svg, $RES/mipmap-*, $RES/drawable*/splash.png"
