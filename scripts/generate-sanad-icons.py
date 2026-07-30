from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image, ImageChops
except ImportError as exc:
    raise SystemExit("Pillow is required: python -m pip install Pillow") from exc

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "logo.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"


def crop_outer_whitespace(image: Image.Image) -> Image.Image:
    """Crop only the outer white canvas; never redraw or reshape the logo."""
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

    # Android adaptive-icon safe zone. The supplied logo remains visually unchanged.
    save(place_unchanged(logo, 432, 0.62), RES / "drawable-nodpi" / "sanad_logo_foreground.png")

    densities = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, size in densities.items():
        icon = place_unchanged(logo, size, 0.76)
        save(icon, RES / folder / "ic_launcher.png")
        save(icon, RES / folder / "ic_launcher_round.png")

    print("Generated Android icons from public/logo.png without altering the logo artwork.")


if __name__ == "__main__":
    main()
