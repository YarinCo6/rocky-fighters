/* Shared by the coach board and PDF reports. Dates are calendar days, never UTC instants. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RockyCompetitions = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function dateKey(value) {
        const raw = String(value || '').trim();
        const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        const legacy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(raw);
        if (!iso && !legacy) return '';
        const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(legacy[3]), Number(legacy[2]), Number(legacy[1])];
        if (year < 1000 || year > 9999) return '';
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function todayKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function normalized(value) {
        return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    }

    function buildRows(users) {
        const rows = [];
        const days = new Map();
        users.forEach(user => {
            (Array.isArray(user.competitions) ? user.competitions : []).forEach((comp, index) => {
                if (!comp || typeof comp !== 'object') return;
                const date = dateKey(comp.dateISO) || dateKey(comp.date);
                const eventKey = JSON.stringify([date, normalized(comp.name), normalized(comp.location).replace(/^--$/, '')]);
                const row = { user, comp, index, date, eventKey, overlap: false, athleteOverlap: false, participants: 1, otherEvents: [] };
                rows.push(row);
                if (!date || comp.status === 'cancelled' || comp.status === 'canceled') return;
                if (!days.has(date)) days.set(date, []);
                days.get(date).push(row);
            });
        });
        days.forEach(day => {
            const events = new Map();
            const athletes = new Map();
            day.forEach(row => {
                if (!events.has(row.eventKey)) events.set(row.eventKey, []);
                events.get(row.eventKey).push(row);
                if (!athletes.has(row.user.id)) athletes.set(row.user.id, new Set());
                athletes.get(row.user.id).add(row.eventKey);
            });
            day.forEach(row => {
                row.participants = new Set(events.get(row.eventKey).map(r => r.user.id)).size;
                row.overlap = events.size > 1;
                row.athleteOverlap = athletes.get(row.user.id).size > 1;
                row.otherEvents = [...events.entries()].filter(([key]) => key !== row.eventKey).map(([, group]) => ({ name: group[0].comp.name, location: group[0].comp.location }));
            });
        });
        return rows.sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99') || normalized(a.comp.name).localeCompare(normalized(b.comp.name)) || normalized(a.user.nameHe || a.user.nameEn || a.user.name).localeCompare(normalized(b.user.nameHe || b.user.nameEn || b.user.name)));
    }

    // Conflicts are computed BEFORE filtering so another athlete's event remains visible as a warning.
    function filterRows(rows, filters = {}, today = todayKey()) {
        const search = normalized(filters.search);
        return rows.filter(row => {
            if (filters.period === 'upcoming' && ((row.date && row.date < today) || ['done', 'cancelled', 'canceled'].includes(row.comp.status))) return false;
            if (filters.period === 'past' && (!row.date || row.date >= today)) return false;
            if (filters.athlete && row.user.id !== filters.athlete) return false;
            if (filters.from && (!row.date || row.date < filters.from)) return false;
            if (filters.to && (!row.date || row.date > filters.to)) return false;
            if (filters.overlapsOnly && !row.overlap) return false;
            if (search && !normalized([row.user.name, row.user.nameHe, row.user.nameEn, row.user.gym, row.comp.name, row.comp.location, row.comp.weight].join(' ')).includes(search)) return false;
            return true;
        });
    }

    return { dateKey, todayKey, buildRows, filterRows };
});
