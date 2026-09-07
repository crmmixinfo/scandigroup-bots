#!/bin/bash
# ONIX — botni fonda ishlaydigan qilish (macOS)
#
# Shundan keyin bot Terminal oynasisiz ishlaydi:
#   · Kompyuter yonganda o'zi ishga tushadi
#   · Terminal yopilsa ham to'xtamaydi
#   · Xato bo'lib o'chsa — launchd uni o'zi qayta yoqadi
#
# Bir marta bosiladi. Keyin bot haqida o'ylamaysiz.
# Bekor qilish: ONIX-avtomat-ochirish.command

SELF="$0"
while [ -L "$SELF" ]; do SELF="$(readlink "$SELF")"; done
cd "$(dirname "$SELF")/../.." 2>/dev/null

if [ ! -f package.json ] || ! grep -q '"onix"' package.json; then
  echo "❌ ONIX papkasi topilmadi."
  echo "   Bu faylni loyiha ichidan ko'chirmang — yorliq (псевдоним) qo'ying."
  echo; read -n1 -s; exit 1
fi

REPO="$(pwd)"
LABEL="uz.onix.bot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

clear
echo "════════════════════════════════════"
echo "  ONIX — fonda ishlashga o'tkazish"
echo "════════════════════════════════════"
echo

# ---------- node ni topamiz ----------
# launchd cheklangan PATH bilan ishlaydi, shuning uchun to'liq yo'l kerak
NODE="$(command -v node 2>/dev/null)"
if [ -z "$NODE" ]; then
  for c in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    [ -x "$c" ] && NODE="$c" && break
  done
fi
if [ -z "$NODE" ]; then
  echo "❌ node topilmadi. Node.js o'rnatilganini tekshiring."
  echo; read -n1 -s; exit 1
fi
echo "✓ node: $NODE"
echo "✓ papka: $REPO"

# ---------- .env bormi ----------
if [ ! -f "$REPO/.env" ]; then
  echo
  echo "❌ .env fayli yo'q — bot token va bazasiz ishlamaydi."
  echo; read -n1 -s; exit 1
fi
echo "✓ .env joyida"

# ---------- Ishlab turgan bot bo'lsa to'xtatamiz ----------
if launchctl list 2>/dev/null | grep -q "$LABEL"; then
  echo "✓ eski avtomat ishga tushirish to'xtatildi"
  launchctl unload "$PLIST" 2>/dev/null
fi

mkdir -p "$HOME/Library/LaunchAgents"

# ---------- Sozlama faylini yozamiz ----------
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$REPO/onix-bot.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$REPO</string>

  <!-- Kompyuter yonganda o'zi ishga tushsin -->
  <key>RunAtLoad</key>
  <true/>

  <!-- O'chib qolsa qayta yoqilsin -->
  <key>KeepAlive</key>
  <true/>

  <!-- Cheksiz qayta urinib protsessorni yemasin -->
  <key>ThrottleInterval</key>
  <integer>30</integer>

  <key>StandardOutPath</key>
  <string>$REPO/onix-bot.log</string>
  <key>StandardErrorPath</key>
  <string>$REPO/onix-bot.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLISTEOF

echo "✓ sozlama yozildi: $PLIST"

# ---------- Ishga tushiramiz ----------
if ! launchctl load -w "$PLIST" 2>/dev/null; then
  echo "❌ Ishga tushirib bo'lmadi. Xatoni Claude ga yuboring:"
  launchctl load -w "$PLIST"
  echo; read -n1 -s; exit 1
fi

echo "✓ ishga tushirildi"
echo
echo "⏳ Bot yonishini kutamiz…"
sleep 6

if grep -q "ishga tushdi" "$REPO/onix-bot.log" 2>/dev/null; then
  echo
  echo "════════════════════════════════════"
  echo "✅ TAYYOR — bot fonda ishlayapti"
  echo "════════════════════════════════════"
  echo
  echo "Endi:"
  echo "  · Terminalni yopsangiz ham ishlaydi"
  echo "  · Kompyuter yonganda o'zi ishga tushadi"
  echo "  · O'chib qolsa o'zi qayta yonadi"
  echo
  echo "Tekshirish uchun Telegramda botga /menu yozing."
else
  echo
  echo "⚠️  Bot hali javob bermadi. Oxirgi yozuvlar:"
  echo "────────────────────────────────────"
  tail -20 "$REPO/onix-bot.log" 2>/dev/null || echo "(log bo'sh)"
  echo "────────────────────────────────────"
  echo "Shu yozuvni Claude ga yuboring."
fi

echo
echo "Yopish uchun istalgan tugmani bosing."
read -n1 -s
