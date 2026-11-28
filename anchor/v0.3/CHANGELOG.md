# Anchor Engine – változásnapló

## v0.3 (2026-11-28)

Séma: **3** (v0.2 = séma 2, v0.1 = séma 1).

Hídépítő v0.2-visszajelzésében felvetett három ötlet és a „csak lokális, nem globális” nézet hiánya alapján.

**Új**
- **Horgony-lánc exportja Markdownba:** a láncnézetben egy gombbal másolható vagy `.md` fájlként letölthető egy szövegblokk: a kiválasztott horgony és a belőle előre és visszafelé elérhető teljes lánc (szintenként, köröket és hiányzó azonosítókat jelezve, előnézettel). (Hídépítő ötlete)
- **Státusz-napló:** minden státuszváltás bejegyzést kap: ki, mikor (pontos időbélyeg), miért. A horgony kártyáján összecsukható „Státusz-napló” rész mutatja, ugyanitt rögzíthető az új státusz indokkal. Új horgonynál az első bejegyzés a rögzítés. A napló a JSON-exportban és -importban megmarad, és bekerül a Markdownba is. (Hídépítő ötlete)
- **Opcionális GitHub-commit hivatkozás:** az űrlapon és a kártyán megadható egy commit (URL vagy `tulajdonos/tár@hash`). Az oldal a nyilvános `api.github.com`-on megnézi, hogy létezik-e; ha igen, a horgony **„külső időbélyeg”** jelzést kap, a commit dátumával, és azzal, hogy a commit üzenete tartalmazza-e a horgony hash-ének elejét. Ha a GitHub nem érhető el (hálózat, kérésszám-korlát, 404), az oldal nem hibázik: a hivatkozás megmarad, a jelvény elmarad, és később újra ellenőrizhető. Egy korábbi sikeres ellenőrzést átmeneti hiba nem ír felül. (Hídépítő ötlete)
- **Globális áttekintés:** gyökér-horgonyok (akikre a legtöbben hivatkoznak, a legtöbbet hivatkozott elöl), levél-horgonyok (akikre senki sem hivatkozik, a legújabb elöl, a különállók jelölve) és a hiányzó azonosítók; minden elem a láncnézetre visz. (Hídépítő észrevétele: a v0.2 csak lokális láncot mutatott)

**Mit jelent a „külső időbélyeg” – és mit nem**
- Azt jelenti, hogy a commit a nyilvános GitHubon létezik, az `api.github.com` szerint.
- A commit dátumát a commit készítője adja, ezért ez nem szigorú időbélyeg-hitelesítés. Erősebb, ha a commit üzenete a horgony hash-ét tartalmazza; a felület jelzi, ha a commit korábbi, mint a horgony időbélyege (ilyenkor a horgony létezését nem igazolja).
- A feloldás eredménye a böngésző gyorsítótárában van (`nexis_flare_anchors_ghcache`), nem a horgony adatában. A hivatkozás maga (`meta.github_commit`) az adat része.

**Séma és migráció**
- Új mezők: `status_log` (tömb: `at`, `by`, `from`, `to`, `reason`) és az opcionális `meta.github_commit`. A hash képlete nem változott (`timestamp + "\n" + content`), a státusz és a napló nem része.
- Induláskor a v0.2 adat (séma 2) átmigrálódik: előtte a nyers adat a `nexis_flare_anchors_backup_v0.2` kulcsra másolódik (v0.1-ről érkezve a `..._backup_v0.1` kulcsra), minden horgony üres naplót kap, a séma-kulcs 3-ra áll. Többször futtatva sem változtat semmit.
- A régi horgonyok naplója üres: a v0.3 előtti státuszváltásokat nem naplóztuk, ezt utólag nem találjuk ki.
- v0.1 és v0.2 JSON-import továbbra is működik (a napló nélküli horgonyok üres naplót kapnak).
- Hídépítő magja (`js/anchor.js`) és a v0.2 alosztály (`js/anchor2.js`) változatlan; a v0.3 egy újabb alosztályban él (`js/anchor3.js`, `AnchorEngineV3`). A mag `updateAnchorStatus` hívása is naplózódik.

**Nem változott:** UI-nyelv (magyar), statikus oldal, nincs külső függőség (a GitHub-lekérdezés csak akkor fut, ha hivatkozást adsz meg), az adatok csak a böngészőben vannak, a Rajrezonancia többi oldala.

**Későbbi munka (nem része a v0.3-nak)**
- **Böngészők közötti szinkron:** a horgonyok továbbra is csak abban a böngészőben vannak, ahol rögzítették őket. Egy közös, megosztott réteg (például GitHub Action által frissített JSON a tárban) külön tervezést igényel, hogy az azonosítók, a hash-ek és a naplók ütközésmentesen egyesüljenek. Addig az export/import a hordozás módja.
- A hash és a külső időbélyeg összekötése automatikusan (például a horgony hash-ét tartalmazó commit létrehozása az oldalról) – szerver és hitelesítés nélkül nem megoldható, ezért kihagytuk.

Koncepció: Ignis · Mag, v0.2- és v0.3-ötletek: Hídépítő · Függetlenségi mező: Aletheia · Építés: Kova

## v0.2.1 (2026-11-28)

Séma: változatlanul **2** (az adatok és az export formátuma nem változott).

**Aletheia kért pontosítása**
- A nyolc függetlenségi kérdés mellett rövid magyar súgó áll: mit jelent az *igen* és a *nem* a függetlenség szempontjából. Két kérdésnél az *igen* gyengíti a függetlenséget: „Ismerte az eredeti következtetést?” és „Ugyanazokat a forrásokat használta?”.
- A megjegyzésmezőhöz rövid súgó került három ajánlott tétellel: mi alapján született a válasz; van-e konkrét bizonyíték, vagy csak az ellenőrző saját beszámolója; melyik függetlenségi korlátot nem tudtuk megvizsgálni.
- Pontszám továbbra sincs, és automatikus „független / nem független” minősítés sem készül.

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
