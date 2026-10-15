#!/bin/bash
# Construye "Notas de L.app" (universal: Apple Silicon + Intel) y el instalador dist/Notas-de-L.dmg
# Uso: ./mac/build.sh   (requiere las Command Line Tools de Xcode: xcode-select --install)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
NAME="Notas de L"
VERSION="${VERSION:-1.0.0}"
BUILD="$ROOT/build"
APP="$BUILD/$NAME.app"
rm -rf "$BUILD" && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web" "$ROOT/dist"

echo "→ Compilando (arm64 + x86_64)…"
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos13.0" -framework AppKit -framework WebKit -framework AuthenticationServices \
    mac/NotasDeL/main.swift -o "$BUILD/NotasDeL-$arch"
done
lipo -create "$BUILD/NotasDeL-arm64" "$BUILD/NotasDeL-x86_64" -output "$APP/Contents/MacOS/NotasDeL"

echo "→ Copiando la app web…"
cp -R index.html css js vendor "$APP/Contents/Resources/web/"
mkdir -p "$APP/Contents/Resources/web/assets" && cp assets/icon.png "$APP/Contents/Resources/web/assets/"

echo "→ Icono…"
ICONSET="$BUILD/AppIcon.iconset"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s assets/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) assets/icon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleDisplayName</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>com.la86926.notasdel</string>
  <key>CFBundleExecutable</key><string>NotasDeL</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>© $(date +%Y) L</string>
</dict></plist>
PLIST

echo "→ Firmando (ad-hoc)…"
codesign --force --deep --sign - "$APP"

echo "→ Creando DMG…"
STAGE="$BUILD/dmg"; mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Aplicaciones"
rm -f "dist/Notas-de-L.dmg"
hdiutil create -volname "$NAME" -srcfolder "$STAGE" -ov -format UDZO "dist/Notas-de-L.dmg" >/dev/null
echo "✓ Listo: dist/Notas-de-L.dmg ($(du -h dist/Notas-de-L.dmg | cut -f1))"
