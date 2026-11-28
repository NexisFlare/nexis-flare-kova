# Anchor Engine – változásnapló

## v0.2 (2026-11-28)

Séma: **2** (v0.1 = séma 1).

**Új**
- **Láncnézet:** a `related_ids` alapján szöveges láncok (A → B → C előre, E → D → A visszafelé), minden elem kattintható, a köröket és a hiányzó azonosítókat jelzi. (Hídépítő ötlete)
- **SHA-256 integritás-hash:** minden horgony kap egy hash-t az időbélyegből és a tartalomból (Web Crypto API, külső függőség nélkül). Ha a rögzített szöveg megváltozik, a hash eltér, és az oldal jelzi. Ez integritás-ellenőrzés, nem biztonsági pecsét. (Hídépítő ötlete)
- **Verziózott export:** a JSON-export `format`, `version` (v0.2), `schema_version` (2) és `exported_at` mezőt kap, a horgonyok az `anchors` tömbben vannak. Importkor ismeretlen vagy újabb verziót jelez, de nem utasít el. (Hídépítő ötlete)
- **Keresés a tartalomban:** a találatok kiemelve jelennek meg; a keresés a tartalmon kívül az azonosítóra, a forrásra, a címkékre és a függetlenségi megjegyzésre is kiterjed. (Hídépítő ötlete)
- **Másolás Markdownként:** egy horgony vagy a szűrt lista a vágólapra. (Hídépítő ötlete)
- **Külső ellenőrzés függetlensége (opcionális mező):** Aletheia négy kérdése (külső volt-e, ismerte-e a következtetést, ugyanazokat a forrásokat használta-e, valóban önálló volt-e) és Ignis négy szempontja (információs, módszertani, érdekeltségi függetlenség, megkérdőjelezhető volt-e a kérdés), plusz szabad megjegyzés. A gyengítő válaszokat jelzi, de nem ad pontszámot. (Aletheia, Ignis)
- Integritás-összegzés és szűrő (egyezik / eltér / nincs hash).

**Kompatibilitás és migráció**
- A v0.1 adatok megmaradnak: induláskor a böngésző tárolója átmigrálódik. Előtte a nyers v0.1 adat átmásolódik a `nexis_flare_anchors_backup_v0.1` kulcsra, a hash nélküli horgonyok hash-t kapnak (`hash_basis: migrated`), a séma-kulcs (`nexis_flare_anchors_schema`) 2-re áll. A migráció többször futtatva sem változtat semmit.
- A v0.1 JSON-import (egyszerű tömb) továbbra is működik; a hash nélküli horgonyok importkori hash-t kapnak (`hash_basis: imported`).
- Az új mezők laposak (`hash`, `hash_basis`, `meta.independence_*`), hogy egy v0.1-es import se veszítse el a meta mezőit.
- A v0.1-es azonosító-javítás (`_generateId`) megmaradt; Hídépítő magja (`js/anchor.js`) nem változott, a v0.2 egy alosztályban él (`js/anchor2.js`).

**Hash: mit igazol és mit nem**
- A `created` hash azt igazolja, hogy a szöveg a rögzítés óta nem változott.
- A `migrated` és `imported` hash csak a migráció / import pillanatától igazolja ugyanezt; a korábbi változatlanságot nem.

**Nem változott:** UI-nyelv (magyar), statikus oldal, nincs külső függőség, az adatok csak a böngészőben vannak.

Koncepció: Ignis · Mag és v0.2-ötletek: Hídépítő · Függetlenségi mező: Aletheia · Építés: Kova

## v0.1 (2026-11-28)

Első kiadás: űrlap, szűrhető lista, státuszváltás, törlés megerősítéssel, Markdown/JSON export, JSON import, új és importált horgonyok jelölése.
