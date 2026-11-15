"""Convert verbatim member text into typst content."""
import re

def typst_escape(s: str) -> str:
    s = s.replace("\\", "\\\\")
    s = s.replace("#", "\\#")
    s = s.replace("$", "\\$")
    s = s.replace("@", "\\@")
    s = s.replace("`", "\\`")
    s = s.replace("~", "\\~")
    s = s.replace("<", "\\<")
    s = s.replace(">", "\\>")
    s = s.replace("*", "\\*")
    s = s.replace("_", "\\_")
    return s


def md_inline_to_typst(s: str) -> str:
    """Convert **bold** and *italic* in Kova's markdown, escaping the rest."""
    parts = []
    i = 0
    n = len(s)
    while i < n:
        if s.startswith("**", i):
            j = s.find("**", i + 2)
            if j != -1:
                parts.append("#strong[" + typst_escape(s[i + 2 : j]) + "]")
                i = j + 2
                continue
        if s[i] == "*" and (i + 1 < n and s[i + 1] != "*"):
            j = s.find("*", i + 1)
            if j != -1 and not s.startswith("**", j):
                parts.append("#emph[" + typst_escape(s[i + 1 : j]) + "]")
                i = j + 1
                continue
        # consume until next markup
        nxt = n
        star = s.find("*", i)
        if star != -1:
            nxt = star
        parts.append(typst_escape(s[i:nxt]))
        i = nxt
        if i == n:
            break
        if nxt == star and star == -1:
            break
    return "".join(parts)


def classify(s: str) -> str:
    if s.startswith("Modell:") or s.startswith("Model:"):
        return "header"
    if s.startswith("[Modell:") or s.startswith("[Model:"):
        return "header"
    if s.startswith("Lumen "):
        return "header"
    if s.startswith("— ") or s.startswith("– "):
        return "sign"
    if s.startswith("Vibe –") or s.startswith("Vibe -"):
        return "sign"
    if s.startswith("(Signed:"):
        return "sign"
    if s.startswith("Claude Sonnet 5.5"):
        return "sign"
    if s.startswith("### "):
        return "section"
    if s.startswith("## "):
        return "section"
    if s.startswith("(a)") or s.startswith("(b)") or s.startswith("B)"):
        return "section"
    # All-caps short title (Ignis)
    letters = re.sub(r"[^A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]", "", s)
    if letters and letters == letters.upper() and len(s) <= 80 and not s.startswith("http"):
        return "section"
    # Numbered title line only (not a full paragraph starting with a number)
    m = re.match(r"^(\d+)\.\s+(\S.*)$", s)
    if m and len(s) <= 110:
        # If the line is mostly a title (no long sentence after a period mid way)
        rest = m.group(2)
        # long body on same line (Végfény "1. Egy mondat, egy kép...") — treat as body
        if len(rest) > 90:
            return "body"
        # title-like if short or ends without a long clause
        if len(s) <= 90:
            return "section"
    if len(s) <= 80 and not re.search(r"[.!?…:]$", s) and not s[0].islower():
        return "section"
    return "body"


def clean_section(s: str) -> str:
    if s.startswith("### "):
        s = s[4:]
    elif s.startswith("## "):
        s = s[3:]
    if s.startswith("**") and s.endswith("**"):
        s = s[2:-2]
    return s


def render_voice(text: str, markdown: bool = False) -> str:
    out = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        kind = classify(s)
        if kind == "header":
            out.append("#voice-header[" + typst_escape(s) + "]")
        elif kind == "section":
            title = clean_section(s)
            if markdown:
                title_t = md_inline_to_typst(title)
            else:
                title_t = typst_escape(title)
            out.append("#subhead[" + title_t + "]")
        elif kind == "sign":
            out.append("#sign[" + typst_escape(s) + "]")
        else:
            if markdown:
                body = md_inline_to_typst(s)
            else:
                body = typst_escape(s)
            out.append(body)
            out.append("")  # paragraph break
    return "\n".join(out).rstrip() + "\n"
