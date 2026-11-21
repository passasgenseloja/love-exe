#!/usr/bin/env python3
"""Gera og.png (1200x630) para o preview do LOVE.exe no WhatsApp/link."""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

W, H = 1200, 630
BLACK = (8, 7, 8)
RED = (197, 31, 53)
RED_DARK = (143, 16, 36)
TEXT = (216, 209, 211)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "og.png")

F_TITLE = ImageFont.truetype("C:/Windows/Fonts/impact.ttf", 168)
F_SUB = ImageFont.truetype("C:/Windows/Fonts/georgiai.ttf", 40)
F_MONO = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 24)
F_EYEBROW = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 22)


def radial(size, invert=False):
    g = Image.radial_gradient("L").resize(size, Image.BILINEAR)
    return ImageChops.invert(g) if invert else g


def falloff_mask(size, alpha, limit=185):
    """mascara que chega em zero antes da borda (sem costura retangular)"""
    g = Image.radial_gradient("L").resize(size, Image.BILINEAR)
    def f(v):
        if v >= limit:
            return 0
        k = 1.0 - v / limit
        return int(alpha * 255 * k * k)
    return g.point(f)


def glow(img, center, radius, color, alpha):
    """grande brilho radial colorido, sem borda visivel"""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    patch = Image.new("RGBA", (radius * 2, radius * 2), color + (255,))
    patch.putalpha(falloff_mask((radius * 2, radius * 2), alpha))
    layer.paste(patch, (center[0] - radius, center[1] - radius))
    return Image.alpha_composite(img, layer)



def heart_points(cx, cy, s):
    pts = []
    for i in range(180):
        t = i / 180 * 2 * math.pi
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * s, cy - y * s))
    return pts


def centered(draw, text, font, y, fill, glow_layer=None):
    bbox = draw.textbbox((0, 0), text, font=font)
    x = (W - (bbox[2] - bbox[0])) // 2 - bbox[0]
    if glow_layer is not None:
        glow_layer.text((x, y), text, font=font, fill=fill)
    draw.text((x, y), text, font=font, fill=fill)


img = Image.new("RGBA", (W, H), BLACK + (255,))

# luzes vermelhas de canto
img = glow(img, (140, -60), 660, RED_DARK, 0.75)
img = glow(img, (W - 110, H + 70), 680, RED, 0.42)
img = glow(img, (W // 2, H // 2 - 40), 560, RED_DARK, 0.28)

# coracao atras do titulo
ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
d.polygon(heart_points(W // 2, H // 2 - 30, 9.2), fill=RED + (34,))
ov = ov.filter(ImageFilter.GaussianBlur(2))
img = Image.alpha_composite(img, ov)

# vinheta
vig = Image.new("RGBA", (W, H), BLACK + (255,))
vig.putalpha(radial((W, H), invert=True).point(lambda v: int(v * 0.72)))
img = Image.alpha_composite(img, vig)

# ---- texto ----
# camada de brilho: so o titulo (desfoca depois)
glow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
centered(ImageDraw.Draw(glow_layer), "LOVE.exe", F_TITLE, 190, RED + (255,))
glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(26))
glow_layer = Image.alpha_composite(glow_layer, glow_layer)

# camada nitida: tudo o mais
final = Image.new("RGBA", (W, H), (0, 0, 0, 0))
fd = ImageDraw.Draw(final)

fd.line([(70, 92), (W - 70, 92)], fill=RED + (255,), width=2)
centered(fd, "protocolo 0x01  //  uma pergunta para você", F_EYEBROW, 46, (197, 31, 53, 235))

centered(fd, "LOVE.exe", F_TITLE, 190, (245, 240, 242, 255))
centered(fd, "Uma pergunta. Duas respostas. Uma missão.", F_SUB, 396, TEXT + (255,))

fd.line([(70, H - 96), (W - 70, H - 96)], fill=RED_DARK + (255,), width=2)
fd.polygon(heart_points(W // 2, H - 52, 0.62), fill=RED + (255,))
fd.text((70, H - 62), "você namoraria comigo?", font=F_MONO, fill=(216, 209, 211, 170))
label = "sim"
bb = fd.textbbox((0, 0), label, font=F_MONO)
fd.text((W - 70 - (bb[2] - bb[0]), H - 62), label, font=F_MONO, fill=RED + (255,))

img = Image.alpha_composite(img, glow_layer)
img = Image.alpha_composite(img, final)

# grao leve
noise = Image.effect_noise((W, H), 16).convert("L").point(lambda v: int(v * 0.05))
img = Image.alpha_composite(img, Image.merge("RGBA", (noise, noise, noise, noise.point(lambda v: 14))))

img.convert("RGB").save(OUT, "PNG", optimize=True)
print("ok:", OUT, os.path.getsize(OUT) // 1024, "KB")
