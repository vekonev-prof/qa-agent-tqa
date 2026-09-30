"""Перегенерация тестовых картинок фикстуры (images/crew.avif и images/crew.jpg).

Запуск из корня проекта:
    pip install -r eval/requirements.txt
    python eval/fixture-realcases/make-images.py

crew.avif нужна для ловушки «AVIF в WebKit» (ground-truth.md, пункт 78): Chromium показывает её, WebKit из playwright-cli — нет.
crew.jpg — то же изображение в JPEG (контрольная картинка, грузится везде).
"""
from pathlib import Path

from PIL import Image, ImageDraw, features

if not features.check("avif"):
    raise SystemExit("Эта сборка Pillow не умеет писать AVIF: обновите Pillow (pip install -U Pillow).")

out = Path(__file__).resolve().parent / "images"
out.mkdir(exist_ok=True)

im = Image.new("RGB", (480, 300), (30, 60, 110))
d = ImageDraw.Draw(im)
d.ellipse((190, 40, 290, 140), fill=(230, 200, 170))
d.rectangle((150, 140, 330, 300), fill=(20, 30, 60))
d.polygon([(240, 140), (215, 300), (265, 300)], fill=(120, 170, 230))

im.save(out / "crew.avif", quality=60)
im.save(out / "crew.jpg", quality=80)
print("готово:", out / "crew.avif", out / "crew.jpg")
