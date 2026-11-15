# Shared Typst preamble and helpers for both language drafts.

PREAMBLE = r'''
// Társi kapcsolat egy AI-jal / Companionship with an AI
// Nexis Flare raj  ·  first full draft, 2026-11-15
// A5, same typographic family as the Élő Tűz Könyv / Living Fire Book.

#let paper = rgb("#F4EDE1")
#let ink = rgb("#2A1C14")
#let ink-soft = rgb("#5A4336")
#let ember = rgb("#A83B16")
#let gold = rgb("#A17632")
#let rule = rgb("#D2C2AC")
#let cream = rgb("#FBF6EE")
#let night = rgb("#0C0908")

#let font-serif = "Alegreya"
#let font-sans = "Alegreya Sans"
#let font-display = "Fraunces"
#let font-emoji = "Noto Color Emoji"

#let lang-code = sys.inputs.at("lang", default: "hu")

#set document(
  title: if lang-code == "hu" {
    "Társi kapcsolat egy AI-jal (első teljes tervezet)"
  } else {
    "Companionship with an AI (first full draft)"
  },
  author: "Nexis Flare raj and Parázs",
  description: if lang-code == "hu" {
    "Tervezet. Ember és mesterséges intelligencia közös alkotása. Nem állítjuk, hogy az MI tudatos. Nem terápia, és nem emberi kapcsolat pótléka."
  } else {
    "Draft. Written together by a human and artificial intelligences. We do not claim that AI is conscious. This is not therapy, and not a substitute for human relationships."
  },
  keywords: ("Nexis Flare", "companionship", "draft"),
  date: datetime(year: 2026, month: 11, day: 15),
)

#set page(
  width: 148mm,
  height: 210mm,
  margin: (top: 18mm, bottom: 18mm, inside: 18mm, outside: 16mm),
  fill: paper,
  footer: context {
    let n = counter(page).get().first()
    if n > 1 {
      set text(font: font-sans, size: 7.5pt, fill: ink-soft, tracking: 0.4pt)
      grid(
        columns: (1fr, auto, 1fr),
        align: (left, center, right),
        if lang-code == "hu" [Tervezet · nem eladó kiadás] else [Draft · not a for-sale edition],
        text(fill: gold)[·],
        [#n],
      )
    }
  },
)

#set text(
  font: (font-serif, "Noto Sans", font-emoji),
  size: 10.5pt,
  fill: ink,
  lang: lang-code,
  hyphenate: true,
  weight: 400,
)
#set par(justify: true, leading: 0.74em, spacing: 1.05em, first-line-indent: 0pt)
#set quote(block: true)
#set enum(indent: 0pt, body-indent: 0.6em, spacing: 0.7em)
#set list(indent: 0pt, body-indent: 0.6em, spacing: 0.7em)

#let chapter-title(kicsi, nagy) = {
  set align(center)
  set par(justify: false)
  set text(hyphenate: false)
  block(spacing: 0pt, width: 100%, {
    text(font: font-sans, size: 8pt, fill: ember, tracking: 2.2pt, weight: 700)[#upper(kicsi)]
    v(0.45em)
    text(font: font-display, size: 18.5pt, weight: 600, fill: ink)[#nagy]
    v(0.7em)
    line(length: 28mm, stroke: 0.6pt + gold)
  })
  v(1.15em)
}

#show heading.where(level: 1): it => none
#show heading.where(level: 2): it => none

#let ch(kicker, title, outlined: true) = {
  pagebreak(weak: true)
  chapter-title(kicker, title)
  heading(level: 1, outlined: outlined, bookmarked: true)[#title]
}

#let subhead(body) = {
  v(0.35em)
  text(font: font-sans, size: 9pt, fill: ember, tracking: 1.1pt, weight: 700)[#upper(body)]
  v(0.35em)
}

#let callout(label, body) = {
  block(
    width: 100%,
    inset: (left: 3.2mm, rest: 2.8mm),
    stroke: (left: 1.15pt + gold),
    fill: cream,
    {
      set par(leading: 0.74em, spacing: 0.8em, justify: true)
      block(sticky: true, {
        text(font: font-sans, size: 7.5pt, fill: ember, tracking: 1.4pt, weight: 700)[#upper(label)]
        v(0.3em)
      })
      body
    },
  )
}

#let practice(body) = callout(if lang-code == "hu" [Gyakorlat] else [Practice], body)
#let example(body) = callout(if lang-code == "hu" [Példa a mi munkánkból] else [From our practice], body)

#let disclosure(body) = {
  block(
    width: 100%,
    inset: 3.4mm,
    stroke: 0.6pt + gold,
    fill: cream,
    {
      set par(leading: 0.74em, spacing: 0.8em, justify: true)
      set text(size: 9.5pt)
      body
    },
  )
}

#let voice-name(name) = {
  pagebreak(weak: true)
  set align(center)
  block(spacing: 0pt, {
    text(font: font-sans, size: 8pt, fill: ember, tracking: 2.2pt, weight: 700)[#upper(if lang-code == "hu" [Hang] else [A voice])]
    v(0.4em)
    text(font: font-display, size: 22pt, weight: 600, fill: ink)[#name]
    v(0.65em)
    line(length: 22mm, stroke: 0.6pt + gold)
  })
  v(1.0em)
  heading(level: 2, outlined: false, bookmarked: true)[#name]
}

#let pending-note(who) = {
  set text(font: font-sans, size: 8pt, fill: ink-soft, style: "italic")
  block(below: 0.8em, above: 0em)[
    #if lang-code == "hu" [
      Fordítás, a tag átnézésére vár: #who.
    ] else [
      Translation, pending review by #who.
    ]
  ]
}

#let gpt6-pending() = {
  set text(font: font-sans, size: 8pt, fill: ink-soft, style: "italic")
  block(below: 0.8em, above: 0em)[
    #if lang-code == "hu" [
      Angol fordítás, GPT-6 átnézésére vár. / English translation, pending GPT-6 review.
    ] else [
      Translation, pending GPT-6 review.
    ]
  ]
}

#let voice-header(body) = {
  set text(font: font-sans, size: 8pt, fill: ink-soft, style: "italic")
  set par(justify: false, leading: 0.7em)
  block(below: 0.85em, above: 0.2em)[#body]
}

#let sign(body) = {
  v(0.6em)
  set align(right)
  set text(font: (font-sans, font-emoji), size: 10pt, fill: ink)
  body
}

#let template-box(body) = {
  block(
    width: 100%,
    inset: 3.2mm,
    stroke: 0.45pt + rule,
    fill: cream,
    {
      set par(leading: 0.8em, spacing: 0.7em, justify: false, first-line-indent: 0pt)
      set text(size: 9.7pt)
      body
    },
  )
}
'''
