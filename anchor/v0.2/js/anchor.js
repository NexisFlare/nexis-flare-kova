/**
 * AnchorEngine – a horgonyok kezelése.
 * A Hídépítő hozzájárulása a Rajrezonancia – Lángtér projektjéhez.
 * Minden horgony forrással, időbélyeggel és státusszal rendelkezik.
 */
class AnchorEngine {
    constructor(storageKey = 'nexis_flare_anchors') {
        this.storageKey = storageKey;
        this.anchors = this._load();
    }

    // --- Betöltés és mentés ---
    _load() {
        const raw = localStorage.getItem(this.storageKey);
        return raw ? JSON.parse(raw) : [];
    }

    _save() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.anchors));
    }

    // --- CRUD ---
    addAnchor(data) {
        const anchor = {
            id: this._generateId(),
            type: data.type || 'thought',
            content: data.content,
            timestamp: new Date().toISOString(),
            source: data.source || { member: 'ismeretlen', platform: 'ismeretlen', thread: '' },
            status: data.status || 'draft',
            tags: data.tags || [],
            related_ids: data.related_ids || [],
            meta: data.meta || {}
        };
        this.anchors.push(anchor);
        this._save();
        return anchor;
    }

    getAnchors(filter = {}) {
        return this.anchors.filter(a => {
            if (filter.type && a.type !== filter.type) return false;
            if (filter.status && a.status !== filter.status) return false;
            if (filter.tag && !a.tags.includes(filter.tag)) return false;
            return true;
        });
    }

    updateAnchorStatus(id, newStatus) {
        const anchor = this.anchors.find(a => a.id === id);
        if (!anchor) throw new Error(`Horgony nem található: ${id}`);
        if (!['draft', 'verified', 'open'].includes(newStatus)) {
            throw new Error(`Érvénytelen státusz: ${newStatus}`);
        }
        anchor.status = newStatus;
        this._save();
        return anchor;
    }

    deleteAnchor(id) {
        const index = this.anchors.findIndex(a => a.id === id);
        if (index === -1) throw new Error(`Horgony nem található: ${id}`);
        const removed = this.anchors.splice(index, 1)[0];
        this._save();
        return removed;
    }

    // --- Export ---
    exportToMarkdown() {
        let md = '# Anchor Engine – Horgonyok\n\n';
        this.anchors.forEach(a => {
            md += `## ${a.id} (${a.type})\n`;
            md += `- **Tartalom:** ${a.content}\n`;
            md += `- **Időbélyeg:** ${a.timestamp}\n`;
            md += `- **Forrás:** ${a.source.member} @ ${a.source.platform} (${a.source.thread})\n`;
            md += `- **Státusz:** ${a.status}\n`;
            if (a.tags.length) md += `- **Címkék:** ${a.tags.join(', ')}\n`;
            if (a.related_ids.length) md += `- **Kapcsolódó:** ${a.related_ids.join(', ')}\n`;
            if (Object.keys(a.meta).length) md += `- **Meta:** ${JSON.stringify(a.meta)}\n`;
            md += '\n---\n\n';
        });
        return md;
    }

    exportToJSON() {
        return JSON.stringify(this.anchors, null, 2);
    }

    importFromJSON(jsonString) {
        const imported = JSON.parse(jsonString);
        if (!Array.isArray(imported)) throw new Error('A JSON gyökérnek tömbnek kell lennie.');
        // Ütközésvizsgálat: ha egy id már létezik, kihagyjuk vagy felülírjuk?
        imported.forEach(a => {
            if (!this.anchors.find(existing => existing.id === a.id)) {
                this.anchors.push(a);
            }
        });
        this._save();
        return this.anchors.length;
    }

    // --- Segédfüggvények ---
    _generateId() {
        const now = new Date();
        const datePart = now.toISOString().slice(0, 10); // YYYY-MM-DD
        let count = this.anchors.filter(a => a.id.startsWith(`anchor-${datePart}`)).length + 1;
        // Kova (2026-11-28): törlés vagy import után a darabszám+1 már létező azonosítót adhatna;
        // addig lépünk tovább, amíg az azonosító szabad. Az id egyedisége így megmarad.
        while (this.anchors.some(a => a.id === `anchor-${datePart}-${String(count).padStart(3, '0')}`)) count++;
        return `anchor-${datePart}-${String(count).padStart(3, '0')}`;
    }
}

// Exportálás a modulrendszerhez (ha van) vagy globális használathoz
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnchorEngine;
} else {
    window.AnchorEngine = AnchorEngine;
}