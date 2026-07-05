#!/usr/bin/env python3
"""Generate Lounge launcher icons with a TV in front of the lounge chair."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "icon-source.png"


def make_icon(size: int) -> Image.Image:
    scale = size / 80.0
    base = Image.open(SOURCE).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)

    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    tv_left = int(18 * scale)
    tv_top = int(30 * scale)
    tv_right = int(62 * scale)
    tv_bottom = int(58 * scale)
    bezel = max(1, int(2 * scale))
    stand_w = int(10 * scale)
    stand_h = max(1, int(3 * scale))
    base_w = int(22 * scale)
    base_h = max(1, int(2 * scale))

    tv_color = (8, 5, 4, 255)
    screen_color = (18, 12, 10, 255)

    draw.rounded_rectangle(
        [tv_left, tv_top, tv_right, tv_bottom],
        radius=max(2, int(3 * scale)),
        fill=tv_color,
    )
    draw.rounded_rectangle(
        [
            tv_left + bezel,
            tv_top + bezel,
            tv_right - bezel,
            tv_bottom - bezel - int(4 * scale),
        ],
        radius=max(1, int(2 * scale)),
        fill=screen_color,
    )

    cx = (tv_left + tv_right) // 2
    draw.rounded_rectangle(
        [
            cx - stand_w // 2,
            tv_bottom - int(2 * scale),
            cx + stand_w // 2,
            tv_bottom + stand_h,
        ],
        radius=max(1, int(1 * scale)),
        fill=tv_color,
    )
    draw.rounded_rectangle(
        [
            cx - base_w // 2,
            tv_bottom + stand_h,
            cx + base_w // 2,
            tv_bottom + stand_h + base_h,
        ],
        radius=max(1, int(1 * scale)),
        fill=tv_color,
    )

    highlight = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(highlight)
    hd.line(
        [(tv_left + bezel, tv_top + bezel), (tv_right - bezel, tv_top + bezel)],
        fill=(40, 28, 22, 90),
        width=max(1, int(1 * scale)),
    )

    result = Image.alpha_composite(base, overlay)
    result = Image.alpha_composite(result, highlight)
    return result.convert("RGB")


def render(name: str, size: int) -> None:
    output = ASSETS / name
    make_icon(size).save(output)
    print(f"Wrote {output} ({size}x{size})")


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source icon: {SOURCE}")

    render("icon.png", 80)
    render("icon-mini.png", 60)
    render("icon-large.png", 130)


if __name__ == "__main__":
    main()