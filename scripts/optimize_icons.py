from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ICON_PATHS = [
    ROOT / "assets/images/icon.png",
    ROOT / "assets/images/splash-icon.png",
    ROOT / "assets/images/favicon.png",
    ROOT / "assets/images/android-icon-foreground.png",
]


def optimize_icon(path: Path) -> None:
    with Image.open(path) as image:
        image = image.convert("RGBA")
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        image.save(path, format="PNG", optimize=True, compress_level=9)


for icon_path in ICON_PATHS:
    optimize_icon(icon_path)
    print(f"{icon_path.name}: {icon_path.stat().st_size} bytes")
