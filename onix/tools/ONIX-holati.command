#!/bin/bash
# ONIX — bot ishlayaptimi? Va oxirgi yozuvlar.
#
# Muammo bo'lganda shu faylni bosing va chiqqanini Claude ga yuboring.

SELF="$0"
while [ -L "$SELF" ]; do SELF="$(readlink "$SELF")"; done
cd "$(dirname "$SELF")/../.." 2>/dev/null

LABEL="uz.onix.bot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

clear
echo "════════════════════════════════════"
echo "  ONIX — holat"
echo "════════════════════════════════════"
echo

if [ -f "$PLIST" ] && launchctl list 2>/dev/null | grep -q "$LABEL"; then
  SATR="$(launchctl list | grep "$LABEL")"
  PID="$(echo "$SATR" | awk '{print $1}')"
  KOD="$(echo "$SATR" | awk '{print $2}')"

  if [ "$PID" != "-" ]; then
    echo "✅ Bot fonda ISHLAYAPTI  (jarayon $PID)"
  else
    echo "⚠️  Bot fonda ro'yxatda bor, lekin hozir ishlamayapti (oxirgi kod: $KOD)"
    echo "   launchd uni 30 soniyada qayta yoqishi kerak."
  fi
else
  echo "⭕️ Bot fonda ishlashga sozlanmagan."
  echo "   Sozlash: ONIX-avtomat-yoqish.command"
  echo
  echo "   (Terminal oynasida qo'lda ishlayotgan bo'lishi mumkin —"
  echo "    u bu yerda ko'rinmaydi.)"
fi

echo
echo "── Oxirgi yozuvlar ──────────────────"
if [ -f onix-bot.log ]; then
  tail -25 onix-bot.log
else
  echo "(log fayli hali yo'q)"
fi
echo "────────────────────────────────────"
echo
echo "Yopish uchun istalgan tugmani bosing."
read -n1 -s
