"""Generate synthetic image fixtures for Elzoz tests (no real products or customers).

Every image shows its own file name, pixel size, a 10% grid, a centre crosshair
and coloured corner markers (TL red, TR green, BL blue, BR yellow), so wrong
placement, cropping, flipping or scaling is visible in any rendered output.

Usage: python3 tests/fixtures-gen/images.py <out_dir>
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else "test-artifacts/fixtures/images"
PRODUCTS = os.path.join(OUT, "products")
LOGOS = os.path.join(OUT, "logos")
os.makedirs(PRODUCTS, exist_ok=True)
os.makedirs(LOGOS, exist_ok=True)


def font(size):
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def marked(name, w, h, color, transparent=False, shape="rect"):
    mode = "RGBA" if transparent else "RGB"
    bg = (0, 0, 0, 0) if transparent else color
    img = Image.new(mode, (w, h), bg)
    d = ImageDraw.Draw(img)
    if transparent:
        if shape == "circle":
            d.ellipse((w * 0.05, h * 0.05, w * 0.95, h * 0.95), fill=color + (255,))
        else:
            d.rounded_rectangle((w * 0.08, h * 0.08, w * 0.92, h * 0.92), radius=int(min(w, h) * 0.12), fill=color + (255,))
    line = (255, 255, 255, 110) if transparent else tuple(min(255, c + 60) for c in color)
    for i in range(1, 10):
        d.line([(w * i / 10, 0), (w * i / 10, h)], fill=line, width=max(1, w // 400))
        d.line([(0, h * i / 10), (w, h * i / 10)], fill=line, width=max(1, h // 400))
    d.line([(w / 2, h * 0.4), (w / 2, h * 0.6)], fill=(255, 255, 255), width=max(2, w // 200))
    d.line([(w * 0.4, h / 2), (w * 0.6, h / 2)], fill=(255, 255, 255), width=max(2, w // 200))
    m = max(8, min(w, h) // 10)
    for (x, y), c in zip([(0, 0), (w - m, 0), (0, h - m), (w - m, h - m)], [(230, 40, 40), (40, 200, 70), (40, 90, 230), (250, 210, 30)]):
        d.rectangle((x, y, x + m, y + m), fill=c)
    label = f"{name}\n{w}x{h}"
    f = font(max(12, min(w, h) // 12))
    d.multiline_text((w / 2, h * 0.22), label, fill=(255, 255, 255), font=f, anchor="mm", align="center", stroke_width=2, stroke_fill=(0, 0, 0))
    return img


def save(img, folder, filename, **kw):
    path = os.path.join(folder, filename)
    fmt = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}[filename.rsplit(".", 1)[1].lower()]
    if fmt == "JPEG" and img.mode == "RGBA":
        img = img.convert("RGB")
    img.save(path, fmt, **kw)
    return path


# --- product images: orientations, aspect ratios, formats, sizes
save(marked("laptop", 1600, 1000, (52, 92, 160)), PRODUCTS, "laptop.jpg", quality=90)  # landscape 16:10
save(marked("phone", 800, 1400, (120, 60, 150)), PRODUCTS, "phone.jpg", quality=90)  # portrait
save(marked("headphones", 1000, 1000, (200, 80, 60), transparent=True, shape="circle"), PRODUCTS, "headphones.png")  # transparent
save(marked("watch", 900, 1200, (30, 140, 120), transparent=True), PRODUCTS, "watch.png")  # transparent portrait
save(marked("camera", 4000, 2667, (90, 90, 90)), PRODUCTS, "camera.jpeg", quality=95)  # large file, 3:2
save(marked("lamp", 1200, 1200, (180, 140, 40)), PRODUCTS, "Lamp.JPG", quality=88)  # upper-case name/extension
save(marked("desk chair", 1000, 1500, (70, 110, 70)), PRODUCTS, "Desk Chair.jpg", quality=88)  # space in name
save(marked("mug jpg", 900, 900, (150, 50, 50)), PRODUCTS, "mug.jpg", quality=88)  # ambiguous stem
save(marked("mug png", 900, 900, (50, 50, 150), transparent=True), PRODUCTS, "mug.png")  # ambiguous stem
save(marked("tiny", 48, 48, (200, 0, 200)), PRODUCTS, "tiny.png")  # very small
save(marked("speaker", 1200, 800, (20, 120, 180)), PRODUCTS, "speaker.webp", quality=90)  # WebP
save(marked("banner", 3000, 600, (160, 60, 100)), PRODUCTS, "banner-wide.jpg", quality=85)  # extreme aspect 5:1
save(marked("tall", 500, 2500, (60, 160, 160)), PRODUCTS, "tall-skinny.png")  # extreme aspect 1:5
# large, high-entropy JPEG (photo-like file size) to exercise big placements
import random
random.seed(7)
noisy = marked("hires", 3000, 2000, (100, 100, 120))
px = noisy.load()
for y in range(0, 2000, 2):
    for x in range(0, 3000, 2):
        r, g, b = px[x, y]
        n = random.randint(-40, 40)
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
save(noisy, PRODUCTS, "camera-hires.jpg", quality=95)

# corrupt file with an image extension, and a non-image file
with open(os.path.join(PRODUCTS, "broken.jpg"), "wb") as f:
    f.write(b"\xff\xd8\xff\xe0 this is not really a jpeg " * 20)
with open(os.path.join(PRODUCTS, "notes.txt"), "w") as f:
    f.write("not an image\n")

# --- logos (transparent)
save(marked("ELZOZ", 600, 240, (253, 185, 38), transparent=True), LOGOS, "elzoz-logo.png")
save(marked("ACME", 400, 400, (30, 30, 30), transparent=True, shape="circle"), LOGOS, "acme.png")
save(marked("NOVA", 800, 300, (0, 120, 200), transparent=True), LOGOS, "nova.png")

for folder in (PRODUCTS, LOGOS):
    for name in sorted(os.listdir(folder)):
        print(f"{os.path.relpath(os.path.join(folder, name), OUT)}\t{os.path.getsize(os.path.join(folder, name))}")
