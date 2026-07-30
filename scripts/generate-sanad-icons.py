from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image, ImageChops
except ImportError as exc:
    raise SystemExit("Pillow is required: python -m pip install Pillow") from exc

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "logo.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

# Android launchers enlarge an adaptive foreground before applying the circle,
# squircle, or rounded-square mask. Keeping the artwork at 44% of the source
# canvas produces the same perceived logo size and white margin as the PWA icon.
ADAPTIVE_FOREGROUND_OCCUPANCY = 0.44
LEGACY_ICON_OCCUPANCY = 0.62


def crop_outer_whitespace(image: Image.Image) -> Image.Image:
    """Crop only the source's outer white canvas; never redraw the logo."""
    rgb = image.convert("RGB")
    white = Image.new("RGB", rgb.size, (255, 255, 255))
    diff = ImageChops.difference(rgb, white).convert("L")
    mask = diff.point(lambda value: 255 if value > 10 else 0)
    box = mask.getbbox()
    if box is None:
        raise SystemExit("The canonical SANAD logo is empty.")
    return rgb.crop(box)


def place_unchanged(logo: Image.Image, size: int, occupancy: float) -> Image.Image:
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    safe = int(size * occupancy)
    scale = min(safe / logo.width, safe / logo.height)
    target = (max(1, round(logo.width * scale)), max(1, round(logo.height * scale)))
    resized = logo.resize(target, Image.Resampling.LANCZOS)
    position = ((size - target[0]) // 2, (size - target[1]) // 2)
    canvas.paste(resized, position)
    return canvas


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def main() -> None:
    logo = crop_outer_whitespace(Image.open(SOURCE))

    save(
        place_unchanged(logo, 432, ADAPTIVE_FOREGROUND_OCCUPANCY),
        RES / "drawable-nodpi" / "sanad_logo_foreground.png",
    )

    densities = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, size in densities.items():
        icon = place_unchanged(logo, size, LEGACY_ICON_OCCUPANCY)
        save(icon, RES / folder / "ic_launcher.png")
        save(icon, RES / folder / "ic_launcher_round.png")

    print(
        "Generated SANAD Android icons with PWA-equivalent white margins "
        "without changing the canonical logo artwork."
    )


if __name__ == "__main__":
    main()
