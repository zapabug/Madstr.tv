#!/bin/bash
# Usage: ./resize.sh source_image.png

SOURCE=$1
if [ -z "$SOURCE" ]; then echo "Usage: ./resize.sh source_image.png"; exit 1; fi

# Launcher icons (PNG)
ffmpeg -y -i "$SOURCE" -vf "scale=48:48" android/app/src/main/res/mipmap-mdpi/ic_launcher.png 2>/dev/null
ffmpeg -y -i "$SOURCE" -vf "scale=72:72" android/app/src/main/res/mipmap-hdpi/ic_launcher.png 2>/dev/null
ffmpeg -y -i "$SOURCE" -vf "scale=96:96" android/app/src/main/res/mipmap-xhdpi/ic_launcher.png 2>/dev/null
ffmpeg -y -i "$SOURCE" -vf "scale=144:144" android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png 2>/dev/null
ffmpeg -y -i "$SOURCE" -vf "scale=192:192" android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png 2>/dev/null

# Round icons
cp android/app/src/main/res/mipmap-mdpi/ic_launcher.png android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-hdpi/ic_launcher.png android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-xhdpi/ic_launcher.png android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png

# Foreground (108x108 transparent)
ffmpeg -y -i "$SOURCE" -vf "scale=108:108:force_original_aspect_ratio=decrease,pad=108:108:(ow-iw)/2:(oh-ih)/2:color=0x00000000" android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_foreground.png 2>/dev/null

# Splash screens
ffmpeg -y -i "$SOURCE" -vf "scale=800:480:force_original_aspect_ratio=decrease" android/app/src/main/res/drawable-land-mdpi/splash.png 2>/dev/null
ffmpeg -y -i "$SOURCE" -vf "scale=1280:720:force_original_aspect_ratio=decrease" android/app/src/main/res/drawable-land-hdpi/splash.png 2>/dev/null
ffmpeg -y -i "$SOURCE" -vf "scale=1600:960:force_original_aspect_ratio=decrease" android/app/src/main/res/drawable-land-xhdpi/splash.png 2>/dev/null
ffmpeg -y -i "$SOURCE" -vf "scale=2560:1440:force_original_aspect_ratio=decrease" android/app/src/main/res/drawable-land-xxhdpi/splash.png 2>/dev/null
ffmpeg -y -i "$SOURCE" -vf "scale=3200:1920:force_original_aspect_ratio=decrease" android/app/src/main/res/drawable-land-xxxhdpi/splash.png 2>/dev/null

echo "Done! Icons generated in android/app/src/main/res/"
