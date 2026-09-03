#!/bin/bash
# ONIX — yangi versiyani olish va botni qayta ishga tushirish
#
# Claude yangilik qo'shganda shu faylni ikki marta bosing.

# Yorliq (alias/symlink) orqali ochilgan bo'lsa — asl faylni topamiz
SELF="$0"
while [ -L "$SELF" ]; do SELF="$(readlink "$SELF")"; done
cd "$(dirname "$SELF")/../.." 2>/dev/null

if [ ! -f package.json ] || ! grep -q '"onix"' package.json; then
  echo "❌ ONIX papkasi topilmadi."
  echo "   Bu faylni loyiha ichidan (onix/tools/) ko'chirmang —"
  echo "   ish stoliga yorliq (псевдоним) qo'ying."
  echo
  read -n1 -s
  exit 1
fi

clear
echo "════════════════════════════════════"
echo "  ONIX — yangilash"
echo "════════════════════════════════════"
echo

BRANCH="claude/salom-2mumbb"

echo "⏳ Yangi kod olinmoqda…"
if ! git pull origin "$BRANCH"; then
  echo
  echo "❌ Yangi kodni olib bo'lmadi. Internetni tekshiring."
  echo "   Muammo takrorlansa Claude ga shu oynadagi yozuvni yuboring."
  echo
  read -n1 -s
  exit 1
fi

echo
echo "⏳ Kutubxonalar tekshirilmoqda…"
npm install --silent

echo
echo "✅ Yangilandi. Bot ishga tushmoqda…"
echo "   To'xtatish: Control + C"
echo

npm run onix

echo
echo "════════════════════════════════════"
echo "Bot to'xtadi. Yopish uchun istalgan tugmani bosing."
read -n1 -s
