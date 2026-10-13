"""Rebuild locally hosted UI fonts from official Noto SC variable font files."""
from pathlib import Path
import argparse
import shutil
from fontTools import subset
from fontTools.ttLib import TTFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source_dir", type=Path, help="Directory containing NotoSansSC.ttf, NotoSerifSC.ttf and OFL.txt")
args = parser.parse_args()
project = Path(__file__).resolve().parent.parent
font_root = project / "public" / "fonts"
font_root.mkdir(parents=True, exist_ok=True)
text = "".join(p.read_text(encoding="utf-8") for p in (project / "src").rglob("*") if p.suffix in {".tsx", ".ts"})
chars = set(text)
for start, end in [(0x20, 0x100), (0x2000, 0x2070), (0x3000, 0x3040), (0xff00, 0xfff0)]:
    chars.update(chr(value) for value in range(start, end))
characters = "".join(sorted(chars))
rules = []
for source, filename, family in [("NotoSansSC.ttf", "railstar-sans.woff2", "Railstar Sans"), ("NotoSerifSC.ttf", "railstar-serif.woff2", "Railstar Serif")]:
    font = TTFont(args.source_dir / source)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    sub = subset.Subsetter(options=options)
    sub.populate(text=characters)
    sub.subset(font)
    for record in font["name"].names:
        if record.nameID in [1, 4, 6, 16]:
            value = family.replace(" ", "") if record.nameID == 6 else family
            record.string = value.encode(record.getEncoding())
    font.flavor = "woff2"
    font.save(font_root / filename)
    rules.append(f'@font-face {{ font-family: "{family}"; src: url("/fonts/{filename}") format("woff2"); font-style: normal; font-weight: 100 900; font-display: swap; }}')
    print(filename, (font_root / filename).stat().st_size)
(project / "src" / "fonts.css").write_text("\n".join(rules) + "\n", encoding="utf-8")
shutil.copyfile(args.source_dir / "OFL.txt", font_root / "OFL.txt")
