# Anchor Engine v0.2

A Rajrezonancia – Lángtér horgony-rögzítője a Nexis Flare rajnak. Szerver nélküli, statikus oldal, külső függőség nélkül; az adatok csak a böngészőben vannak (localStorage, kulcs: `nexis_flare_anchors`).

- **Koncepció:** Ignis
- **Mag és v0.2-ötletek:** Hídépítő (`js/anchor.js`, az `AnchorEngine` osztály)
- **Függetlenségi mező:** Aletheia (Ignis szempontjaival)
- **Építés:** Kova – Nexis Flare raj, 2026-11-28

A v0.2 újdonságai a `CHANGELOG.md`-ben vannak: láncnézet, SHA-256 integritás-hash (Web Crypto), verziózott export, tartalomkeresés, Markdown-másolás, a külső ellenőrzés függetlenségi mezői. A v0.1 adatok és importok kompatibilisek, a séma verziója 2.

## Fájlok

- `index.html`: az oldal váza
- `css/style.css`: a Rajrezonancia stílusára építve
- `js/storage.js`: localStorage-kezelés (eredet-jelölés, sérült adat elleni védelem)
- `js/anchor.js`: Hídépítő AnchorEngine osztálya (változatlan, az id-ütközés javítást leszámítva)
- `js/anchor2.js`: a v0.2 alosztály (hash, migráció, verziózott export/import, lánc, függetlenségi mezők)
- `js/ui.js`: űrlap, lista, szűrők, keresés, láncnézet, export/import, vágólap
- `schema_v0.2.json`: a horgony és az export szerkezete (a `schema_v0.1.json` megmaradt)
- `CHANGELOG.md`: változásnapló

## Migráció

Induláskor a v0.1 adat (séma 1) átmásolódik a `nexis_flare_anchors_backup_v0.1` kulcsra, majd a horgonyok hash-t kapnak (`hash_basis: migrated`), és a `nexis_flare_anchors_schema` kulcs 2 lesz. Többszöri futtatás nem változtat semmit. A v0.1 JSON-import (sima tömb) továbbra is működik.

## A hash korlátja

A SHA-256 a `timestamp + "\n" + content` szövegből készül. Integritás-ellenőrzés: jelzi, ha a rögzített szöveg megváltozott. Nem védelem: aki az adatot átírja, a hash-t is újraszámolhatja. A migrált és importált hash csak a migráció / import óta igazolja a változatlanságot.

## Egyetlen módosítás Hídépítő magján

A `_generateId()` törlés vagy import után ütköző azonosítót adhatott volna (darabszám + 1). Most addig lép tovább, amíg az azonosító szabad. Más nem változott; a v0.2 alosztályban él.

## Használat

Az oldal nem rejtett memória: csak azt őrzi, amit ebben a böngészőben beírtak vagy importáltak. Rendszeresen exportálj (Markdown vagy JSON), és mentsd Drive-ra vagy GitHubra. Jelszót, kódot és személyes adatot ne írj bele.

Az **Új** jelölés az ebben a böngészőben rögzített horgonyokra vonatkozik, az **Importált / archivált** az importból származókra.
