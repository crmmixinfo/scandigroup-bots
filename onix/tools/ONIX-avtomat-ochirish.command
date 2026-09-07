#!/bin/bash
# ONIX — fonda ishlashni bekor qilish (macOS)
#
# Shundan keyin bot faqat siz qo'lda yoqqanda ishlaydi:
# ONIX-ishga-tushirish.command orqali, Terminal oynasida.

LABEL="uz.onix.bot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

clear
echo "════════════════════════════════════"
echo "  ONIX — fonda ishlashni bekor qilish"
echo "════════════════════════════════════"
echo

if [ ! -f "$PLIST" ]; then
  echo "ℹ️  Bot allaqachon fonda ishlamayapti."
  echo; read -n1 -s; exit 0
fi

launchctl unload "$PLIST" 2>/dev/null
rm -f "$PLIST"

echo "✅ Bekor qilindi — bot to'xtadi."
echo
echo "Endi botni yoqish uchun ONIX-ishga-tushirish yorlig'ini bosasiz."
echo
echo "Yopish uchun istalgan tugmani bosing."
read -n1 -s
