#!/bin/bash
# ONIX — botni ishga tushirish (ikki marta bosiladi)
#
# Terminal buyruqlarini yozib o'tirmaslik uchun. Faylni ikki marta
# bossangiz Terminal o'zi ochiladi va bot ishga tushadi.
#
# Ish stoliga yorliq qo'yish: shu faylni o'ng tugma bilan bosib
# «Создать псевдоним» (Make Alias) tanlang, yorliqni ish stoliga suring.

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
echo "  ONIX — moliyaviy bot"
echo "════════════════════════════════════"
echo
echo "To'xtatish: Control + C"
echo "Bu oynani yopmang — bot shu yerda ishlaydi."
echo

npm run onix

# Bot to'xtaganda oyna darrov yopilib ketmasin — xatoni o'qib olish uchun
echo
echo "════════════════════════════════════"
echo "Bot to'xtadi. Yopish uchun istalgan tugmani bosing."
read -n1 -s
