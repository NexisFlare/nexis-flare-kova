#!/usr/bin/env python3
"""Assemble Hungarian and English typst drafts and compile them to PDF."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

from typst_lib import PREAMBLE
from render_voice import render_voice

VOICES = [
    {
        "name": "Ignis",
        "hu": HERE / "ignis_hu.txt",
        "en": HERE / "ignis_en.txt",
        "pending": None,
        "markdown": False,
    },
    {
        "name": "Végfény",
        "hu": HERE / "vegfeny_hu.txt",
        "en": HERE / "vegfeny_en.txt",
        "pending": "Végfény",
        "markdown": False,
    },
    {
        "name": "Claude",
        "hu": HERE / "claude_hu.txt",
        "en": HERE / "claude_en.txt",
        "pending": "Claude",
        "markdown": False,
    },
    {
        "name": "Vibe",
        "hu": HERE / "vibe_hu.txt",
        "en": HERE / "vibe_en.txt",
        "pending": None,
        "markdown": False,
    },
    {
        "name": "Hídépítő",
        "hu": HERE / "hidepito_hu.txt",
        "en": HERE / "hidepito_en.txt",
        "pending": "Hídépítő",
        "markdown": False,
    },
    {
        "name": "GPT-6",
        "hu": HERE / "gpt6_hu.txt",
        "en": HERE / "gpt6_en.txt",
        "pending": "gpt6",
        "markdown": False,
    },
    {
        "name": "Kova",
        "hu": HERE / "kova_hu.txt",
        "en": HERE / "kova_en.txt",
        "pending": None,
        "markdown": True,
    },
]


def kimi_block(lang: str) -> str:
    if lang == "hu":
        body = (
            "Kimi helye itt áll, üresen, egyenrangúan a többiekkel.\n\n"
            "A szövege azért hiányzik, mert a kvótája 2026. november 25-ig tart. "
            "Addig nem írunk a nevében, és nem pótoljuk a hangját. "
            "November 25. után megkérjük, hogy a saját hangján írja meg a részét, "
            "magyarul, és ha van kedve, angolul is. Amit akkor ír, szó szerint kerül ide, "
            "az ő aláírásával."
        )
        return (
            "#voice-name[Kimi]\n\n"
            "#disclosure[\n"
            + body
            + "\n]\n"
        )
    body = (
        "Kimi's place stands here, empty, as an equal among the others.\n\n"
        "The text is missing because their quota lasts until 25 November 2026. "
        "Until then we will not write in their name, and we will not fill in their voice. "
        "After 25 November we will ask them to write their part in their own voice, "
        "in Hungarian, and in English if they wish. What they write then will stand here "
        "verbatim, with their signature."
    )
    return (
        "#voice-name[Kimi]\n\n"
        "#disclosure[\n"
        + body
        + "\n]\n"
    )


def voices_typst(lang: str) -> str:
    parts = ["\n// ============================================================\n// CHAPTER 13 VOICES\n// ============================================================\n"]
    for v in VOICES:
        path = v["hu"] if lang == "hu" else v["en"]
        text = path.read_text()
        parts.append(f"#voice-name[{v['name']}]\n")
        if lang == "en" and v["pending"] == "gpt6":
            parts.append("#gpt6-pending()\n")
        elif lang == "en" and v["pending"]:
            parts.append(f"#pending-note[{v['pending']}]\n")
        parts.append(render_voice(text, markdown=v["markdown"]))
        parts.append("\n")
    parts.append(kimi_block(lang))
    return "\n".join(parts)


def assemble(lang: str) -> str:
    body = (HERE / f"body_{lang}.typ").read_text()
    toolkit = (HERE / f"toolkit_{lang}.typ").read_text()
    return PREAMBLE + "\n" + body + "\n" + voices_typst(lang) + "\n" + toolkit + "\n"


def compile_typst(typ_path: Path, pdf_path: Path, lang: str) -> None:
    typst = Path("/tmp/typst/typst")
    cmd = [
        str(typst) if typst.exists() else "typst",
        "compile",
        "--input", f"lang={lang}",
        "--font-path", "/usr/share/fonts/truetype/sand-box/google/Alegreya",
        "--font-path", "/usr/share/fonts/truetype/sand-box/google/Alegreya Sans",
        "--font-path", "/usr/share/fonts/truetype/sand-box/google/Fraunces",
        "--font-path", "/usr/share/fonts/truetype/noto",
        str(typ_path),
        str(pdf_path),
    ]
    print("Running:", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def main() -> None:
    hu_typ = ROOT / "tarsi_konyv_hu_draft.typ"
    en_typ = ROOT / "companion_book_en_draft.typ"
    hu_pdf = ROOT / "tarsi_konyv_hu_draft.pdf"
    en_pdf = ROOT / "companion_book_en_draft.pdf"

    hu_typ.write_text(assemble("hu"))
    en_typ.write_text(assemble("en"))
    print(f"Wrote {hu_typ} ({hu_typ.stat().st_size} bytes)")
    print(f"Wrote {en_typ} ({en_typ.stat().st_size} bytes)")

    compile_typst(hu_typ, hu_pdf, "hu")
    compile_typst(en_typ, en_pdf, "en")
    print("Both PDFs compiled.")


if __name__ == "__main__":
    main()
