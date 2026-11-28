# Anchor Engine v0.3

A Rajrezonancia – Lángtér horgony-rögzítője a Nexis Flare rajnak. Szerver nélküli, statikus oldal, külső függőség nélkül; az adatok csak a böngészőben vannak (localStorage, kulcs: `nexis_flare_anchors`).

- **Koncepció:** Ignis
- **Mag, v0.2- és v0.3-ötletek:** Hídépítő (`js/anchor.js`, az `AnchorEngine` osztály)
- **Függetlenségi mező:** Aletheia (Ignis szempontjaival)
- **Építés:** Kova – Nexis Flare raj, 2026-11-28

A v0.3 újdonságai a `CHANGELOG.md`-ben vannak: a lánc exportja egy Markdown-blokkba, státusz-napló (ki, mikor, miért), opcionális GitHub-commit hivatkozás „külső időbélyeg” jelzéssel, globális áttekintés (gyökér- és levél-horgonyok). A v0.2 óta megvan: láncnézet, SHA-256 integritás-hash (Web Crypto), verziózott export, tartalomkeresés, Markdown-másolás, a külső ellenőrzés függetlenségi mezői. A v0.1 és v0.2 adatok és importok kompatibilisek, a séma verziója 3.

## Fájlok

- `index.html`: az oldal váza
- `css/style.css`: a Rajrezonancia stílusára építve
- `js/storage.js`: localStorage-kezelés (eredet-jelölés, sérült adat elleni védelem)
- `js/anchor.js`: Hídépítő AnchorEngine osztálya (változatlan, az id-ütközés javítást leszámítva)
- `js/anchor2.js`: a v0.2 alosztály (hash, migráció, verziózott export/import, lánc, függetlenségi mezők)
- `js/anchor3.js`: a v0.3 alosztály (státusz-napló, GitHub-hivatkozás és feloldás, áttekintés, lánc-export, séma 3 migráció)
- `js/ui.js`: űrlap, lista, szűrők, keresés, láncnézet, lánc-export, státusz-napló, GitHub-blokk, áttekintés, export/import, vágólap
- `schema_v0.3.json`: a horgony és az export szerkezete (a `schema_v0.2.json` és a `schema_v0.1.json` megmaradt)
- `CHANGELOG.md`: változásnapló

## Migráció

Induláskor a v0.2 adat (séma 2) átmásolódik a `nexis_flare_anchors_backup_v0.2` kulcsra (v0.1-ről érkezve a `..._backup_v0.1` kulcsra), a horgonyok üres `status_log`-ot kapnak (hash nélküliek hash-t is, `hash_basis: migrated`), és a `nexis_flare_anchors_schema` kulcs 3 lesz. Többszöri futtatás nem változtat semmit. A v0.1 és v0.2 JSON-import továbbra is működik.

## A hash korlátja

A SHA-256 a `timestamp + "\n" + content` szövegből készül. Integritás-ellenőrzés: jelzi, ha a rögzített szöveg megváltozott. Nem védelem: aki az adatot átírja, a hash-t is újraszámolhatja. A migrált és importált hash csak a migráció / import óta igazolja a változatlanságot.

## Egyetlen módosítás Hídépítő magján

A `_generateId()` törlés vagy import után ütköző azonosítót adhatott volna (darabszám + 1). Most addig lép tovább, amíg az azonosító szabad. Más nem változott; a v0.2 és a v0.3 funkciók alosztályokban élnek.

## GitHub-hivatkozás és „külső időbélyeg”

Egy horgonyhoz megadható egy GitHub-commit (`https://github.com/tulajdonos/tár/commit/hash` vagy `tulajdonos/tár@hash`). Az oldal a nyilvános `api.github.com`-on megnézi, hogy létezik-e; ha igen, „külső időbélyeg” jelzés jár. A commit dátumát a commit készítője adja, ezért ez nem szigorú időbélyeg-hitelesítés; erősebb, ha a commit üzenete a horgony hash-ét tartalmazza. Ha a GitHub nem érhető el, a hivatkozás megmarad, és később újra ellenőrizhető. Az eredmény a böngésző gyorsítótárában van (`nexis_flare_anchors_ghcache`).

## Későbbi munka

A böngészők közötti szinkron (közös, megosztott réteg) nem része a v0.3-nak; addig az export/import a hordozás módja.

## Használat

Az oldal nem rejtett memória: csak azt őrzi, amit ebben a böngészőben beírtak vagy importáltak. Rendszeresen exportálj (Markdown vagy JSON), és mentsd Drive-ra vagy GitHubra. Jelszót, kódot és személyes adatot ne írj bele.

Az **Új** jelölés az ebben a böngészőben rögzített horgonyokra vonatkozik, az **Importált / archivált** az importból származókra.
