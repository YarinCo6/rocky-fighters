/* Coach competition board and direct PDF downloads for every dashboard section. */
let competitionBoardUnsub = null;
let competitionBoardUsers = [];
let competitionBoardRows = [];
let competitionBoardState = 'idle';
let competitionBoardGeneration = 0;
let competitionBoardTimer = null;

const COACH_TOOLS_I18N = {
    he: {
        board_title: 'לוח תחרויות למאמנים', board_desc: 'כל הרשמות המתחרים בטבלה אחת, לפי תאריך. מתעדכן אוטומטית.',
        board_period: 'תקופה', board_upcoming: 'מהיום והלאה', board_all: 'כל התאריכים', board_past: 'תאריכים שעברו', board_everyone: 'כל המתחרים',
        board_from: 'מתאריך', board_to: 'עד תאריך', board_search: 'חיפוש שם, תחרות או מיקום', board_overlaps_only: 'רק חפיפות', board_reset: 'איפוס סינון', board_refresh: 'רענון',
        board_legend: 'חפיפה = תחרויות שונות באותו יום. כמה מתחרים באותה תחרות מוצגים כמשתתפים משותפים. הזיהוי מבוסס על שם ומיקום; לא נשמרות שעות תחרות.',
        board_overlap: 'תחרויות שונות באותו יום', board_athlete_overlap: 'למתחרה יש כמה תחרויות באותו יום', board_clear: 'ללא חפיפה', board_shared: '{n} משתתפים באותה תחרות',
        board_unknown: 'תאריך חסר או לא תקין', board_empty: 'אין הרשמות להצגה', board_empty_hint: 'נסה לשנות את הסינון או להוסיף הרשמות לתחרויות.', board_loading: 'טוען תחרויות...',
        board_error: 'טעינת התחרויות נכשלה. לחץ על רענון כדי לנסות שוב.', board_range_error: 'תאריך ההתחלה חייב להיות לפני תאריך הסיום.',
        board_summary: '{rows} הרשמות · {events} תחרויות · {days} ימים עם חפיפות', board_conflicts: 'חפיפות ומשתתפים', board_filtered_pdf: 'הורדת הטבלה המסוננת (PDF)',
        board_pdf_scope: 'הדוח כולל את הרשומות לפי הסינון שנבחר. בדיקת החפיפות מתייחסת לכל ההרשמות, גם מחוץ לסינון.', board_cancelled: 'בוטלה',
        pdf_section: 'הורד מסך זה כ־PDF', pdf_mine: 'הורד את כל הנתונים שלי (PDF)', pdf_full_history: 'הדוח כולל את מלוא ההיסטוריה.',
    },
    en: {
        board_title: 'Coach competition calendar', board_desc: 'All athlete registrations in one date-sorted table. Updates automatically.',
        board_period: 'Period', board_upcoming: 'Today onwards', board_all: 'All dates', board_past: 'Past dates', board_everyone: 'All athletes',
        board_from: 'From date', board_to: 'To date', board_search: 'Search athlete, competition or location', board_overlaps_only: 'Overlaps only', board_reset: 'Reset filters', board_refresh: 'Refresh',
        board_legend: 'Overlap = different competitions on the same day. Athletes at the same event are shown as shared participants. Matching uses event name and location; competition times are not recorded.',
        board_overlap: 'Different competitions on the same day', board_athlete_overlap: 'Athlete has multiple competitions on this day', board_clear: 'No overlap', board_shared: '{n} athletes at this event',
        board_unknown: 'Missing or invalid date', board_empty: 'No registrations to show', board_empty_hint: 'Try different filters or add competition registrations.', board_loading: 'Loading competitions...',
        board_error: 'Could not load competitions. Select Refresh to try again.', board_range_error: 'The start date must be on or before the end date.',
        board_summary: '{rows} registrations · {events} competitions · {days} days with overlaps', board_conflicts: 'Overlaps and participants', board_filtered_pdf: 'Download filtered table (PDF)',
        board_pdf_scope: 'This report contains the selected filtered rows. Overlaps are checked against all registrations, including those outside the filters.', board_cancelled: 'Cancelled',
        pdf_section: 'Download this section (PDF)', pdf_mine: 'Download all my data (PDF)', pdf_full_history: 'This report includes the complete history.',
    },
    de: {
        board_title: 'Wettkampfkalender für Trainer', board_desc: 'Alle Anmeldungen in einer nach Datum sortierten Tabelle. Wird automatisch aktualisiert.',
        board_period: 'Zeitraum', board_upcoming: 'Ab heute', board_all: 'Alle Termine', board_past: 'Vergangene Termine', board_everyone: 'Alle Wettkämpfer',
        board_from: 'Von', board_to: 'Bis', board_search: 'Name, Wettkampf oder Ort suchen', board_overlaps_only: 'Nur Überschneidungen', board_reset: 'Filter zurücksetzen', board_refresh: 'Aktualisieren',
        board_legend: 'Überschneidung = verschiedene Wettkämpfe am selben Tag. Teilnehmer desselben Wettkampfs werden gemeinsam gezählt. Der Abgleich nutzt Name und Ort; Uhrzeiten werden nicht erfasst.',
        board_overlap: 'Verschiedene Wettkämpfe am selben Tag', board_athlete_overlap: 'Mehrere Wettkämpfe dieses Athleten am selben Tag', board_clear: 'Keine Überschneidung', board_shared: '{n} Teilnehmer am selben Wettkampf',
        board_unknown: 'Fehlendes oder ungültiges Datum', board_empty: 'Keine Anmeldungen', board_empty_hint: 'Filter ändern oder Wettkampfanmeldungen hinzufügen.', board_loading: 'Wettkämpfe werden geladen...',
        board_error: 'Wettkämpfe konnten nicht geladen werden. Bitte aktualisieren.', board_range_error: 'Das Startdatum muss vor oder am Enddatum liegen.',
        board_summary: '{rows} Anmeldungen · {events} Wettkämpfe · {days} Tage mit Überschneidungen', board_conflicts: 'Überschneidungen und Teilnehmer', board_filtered_pdf: 'Gefilterte Tabelle herunterladen (PDF)',
        board_pdf_scope: 'Dieser Bericht enthält die gefilterten Einträge. Überschneidungen berücksichtigen alle Anmeldungen, auch außerhalb des Filters.', board_cancelled: 'Abgesagt',
        pdf_section: 'Diesen Bereich herunterladen (PDF)', pdf_mine: 'Alle meine Daten herunterladen (PDF)', pdf_full_history: 'Dieser Bericht enthält den vollständigen Verlauf.',
    }
};

function installCoachTools() {
    Object.entries(COACH_TOOLS_I18N).forEach(([lang, dict]) => Object.assign(translations[lang], dict));
    document.querySelectorAll('.dash-panel').forEach(panel => {
        const section = panel.id.replace('panel-', '');
        if (section === 'coach') return; // The roster already has its own export button.
        const toolbar = document.createElement('div');
        toolbar.className = 'panel-tools';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-pdf';
        button.id = `pdf-${section}`;
        const key = section === 'overview' ? 'pdf_mine' : section === 'competition-board' ? 'board_filtered_pdf' : 'pdf_section';
        button.innerHTML = `<i class="fas fa-file-pdf"></i><span data-i18n="${key}">${T(key)}</span>`;
        button.addEventListener('click', () => exportDashboardPdf(section));
        toolbar.appendChild(button);
        const back = panel.querySelector('.panel-back');
        if (back) back.after(toolbar); else panel.prepend(toolbar);
    });
    updateCoachToolsLanguage();
}

function updateCoachToolsLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (COACH_TOOLS_I18N.he[key]) el.textContent = T(key);
    });
    updateBoardAthletes();
    renderCompetitionBoard();
}

function stopCompetitionBoard(clear = false) {
    competitionBoardGeneration++;
    if (competitionBoardUnsub) competitionBoardUnsub();
    competitionBoardUnsub = null;
    clearTimeout(competitionBoardTimer);
    competitionBoardTimer = null;
    if (clear) {
        competitionBoardUsers = [];
        competitionBoardRows = [];
        competitionBoardState = 'idle';
        resetCompetitionBoardFilters();
        updateBoardAthletes();
        document.getElementById('competitionBoardBtn').style.display = 'none';
    }
}

function startCompetitionBoard(force = false) {
    if (!currentUser || (!isCoach && !isAdmin)) return;
    if (competitionBoardUnsub && !force) return;
    stopCompetitionBoard();
    const generation = competitionBoardGeneration;
    competitionBoardState = 'loading';
    renderCompetitionBoard();
    // A timeout makes a failed/offline initial load recoverable, while a later snapshot can still recover.
    competitionBoardTimer = setTimeout(() => {
        if (generation === competitionBoardGeneration && competitionBoardState === 'loading') {
            competitionBoardState = 'error'; renderCompetitionBoard();
        }
    }, 15000);
    // Staff already have read access to users. Include coaches who also compete.
    competitionBoardUnsub = db.collection('users').onSnapshot(snapshot => {
        if (generation !== competitionBoardGeneration || (!isCoach && !isAdmin)) return;
        clearTimeout(competitionBoardTimer);
        competitionBoardUsers = [];
        snapshot.forEach(doc => competitionBoardUsers.push({ ...doc.data(), id: doc.id }));
        competitionBoardRows = RockyCompetitions.buildRows(competitionBoardUsers);
        competitionBoardState = 'ready';
        updateBoardAthletes();
        renderCompetitionBoard();
    }, error => {
        if (generation !== competitionBoardGeneration) return;
        clearTimeout(competitionBoardTimer);
        competitionBoardState = 'error';
        competitionBoardUsers = []; competitionBoardRows = [];
        console.error('Competition board listener failed:', error);
        renderCompetitionBoard();
    });
}

function updateBoardAthletes() {
    const select = document.getElementById('boardAthlete');
    if (!select) return;
    const selected = select.value;
    select.replaceChildren(new Option(T('board_everyone'), ''));
    competitionBoardUsers.filter(d => Array.isArray(d.competitions) && d.competitions.length)
        .sort((a, b) => displayName(a).localeCompare(displayName(b), langLocale()))
        .forEach(d => select.add(new Option(displayName(d), d.id)));
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

function boardFilters() {
    return {
        period: document.getElementById('boardPeriod').value,
        athlete: document.getElementById('boardAthlete').value,
        from: document.getElementById('boardFrom').value,
        to: document.getElementById('boardTo').value,
        search: document.getElementById('boardSearch').value.trim(),
        overlapsOnly: document.getElementById('boardOverlaps').checked
    };
}

function resetCompetitionBoardFilters() {
    document.getElementById('boardPeriod').value = 'upcoming';
    ['boardAthlete', 'boardFrom', 'boardTo', 'boardSearch'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('boardOverlaps').checked = false;
    renderCompetitionBoard();
}

function boardDate(row) {
    if (!row.date) return `${T('board_unknown')}${row.comp.date ? ` (${row.comp.date})` : ''}`;
    const [year, month, day] = row.date.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(langLocale());
}

function boardConflictText(row) {
    const lines = [];
    if (row.athleteOverlap) lines.push(T('board_athlete_overlap'));
    if (row.overlap) {
        lines.push(T('board_overlap'));
        row.otherEvents.forEach(event => lines.push(`${event.name || '--'} (${event.location || '--'})`));
    }
    if (row.participants > 1) lines.push(T('board_shared').replace('{n}', row.participants));
    if (!lines.length) lines.push(row.date ? T('board_clear') : T('board_unknown'));
    return lines.join('\n');
}

function boardStatus(row) {
    if (['cancelled', 'canceled'].includes(row.comp.status)) return T('board_cancelled');
    return row.comp.status === 'done' ? (row.comp.result || T('dash_comp_history')) : T('dash_registered');
}

function boardSummary(rows) {
    return T('board_summary').replace('{rows}', rows.length)
        .replace('{events}', new Set(rows.map(row => row.eventKey)).size)
        .replace('{days}', new Set(rows.filter(row => row.overlap).map(row => row.date)).size);
}

function renderCompetitionBoard() {
    const results = document.getElementById('boardResults');
    if (!results) return;
    const filters = boardFilters();
    const badRange = filters.from && filters.to && filters.from > filters.to;
    const button = document.getElementById('pdf-competition-board');
    if (button) button.disabled = competitionBoardState !== 'ready' || Boolean(badRange);
    const summary = document.getElementById('boardSummary');
    summary.textContent = '';
    if (!isCoach && !isAdmin) { results.replaceChildren(); return; }
    if (competitionBoardState === 'error') { results.innerHTML = emptyState('fa-triangle-exclamation', T('board_error'), ''); return; }
    if (competitionBoardState !== 'ready') { results.innerHTML = `<p>${T('board_loading')}</p>`; return; }
    if (badRange) { results.innerHTML = `<p role="alert">${T('board_range_error')}</p>`; return; }
    const rows = RockyCompetitions.filterRows(competitionBoardRows, filters);
    summary.textContent = boardSummary(rows);
    if (!rows.length) { results.innerHTML = emptyState('fa-calendar-days', T('board_empty'), T('board_empty_hint')); return; }
    const headers = ['dash_th_date', 'cn_athlete', 'dash_th_comp', 'dash_th_location', 'dash_comp_weight_cat', 'dash_th_status', 'board_conflicts'];
    results.innerHTML = `<div class="planner-wrap" role="region" aria-label="${escAttr(T('board_title'))}" tabindex="0"><table class="comp-table planner-table"><thead><tr>${headers.map(key => `<th scope="col">${T(key)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr class="${row.overlap ? 'planner-overlap' : ''}">
        <td>${sanitize(boardDate(row))}</td>
        <td><button class="planner-athlete" onclick="showCompetitorDetail(${jsArg(row.user.id)})">${sanitize(displayName(row.user))}</button><small>${sanitize(row.user.gym || '--')}</small></td>
        <td><strong>${sanitize(row.comp.name || '--')}</strong></td><td>${sanitize(row.comp.location || '--')}</td><td>${sanitize(row.comp.weight || '--')}</td><td>${sanitize(boardStatus(row))}</td>
        <td><span class="${row.overlap ? 'planner-warning' : ''}">${sanitize(boardConflictText(row)).replace(/\n/g, '<br>')}</span></td></tr>`).join('')}</tbody></table></div>`;
}

function writeCompetitionBoardPdf(w, rows, filters) {
    w.h1(T('board_title'));
    w.muted(`${T('pdf_generated')}: ${new Date().toLocaleString(langLocale())}`);
    w.muted(T('board_pdf_scope'));
    w.muted(T('board_legend'));
    if (filters) {
        const period = { upcoming: 'board_upcoming', all: 'board_all', past: 'board_past' };
        w.kv(T('board_period'), T(period[filters.period] || 'board_all'));
        if (filters.athlete) w.kv(T('cn_athlete'), displayName(competitionBoardUsers.find(d => d.id === filters.athlete) || {}));
        if (filters.from) w.kv(T('board_from'), filters.from);
        if (filters.to) w.kv(T('board_to'), filters.to);
        if (filters.search) w.kv(T('board_search'), filters.search);
        if (filters.overlapsOnly) w.muted(T('board_overlaps_only'));
    }
    w.h2(boardSummary(rows));
    if (!rows.length) { w.muted(T('board_empty')); return; }
    w.table(['dash_th_date', 'cn_athlete', 'dash_th_comp', 'dash_th_location', 'dash_comp_weight_cat', 'dash_th_status', 'board_conflicts'].map(T),
        rows.map(row => [boardDate(row), displayName(row.user), row.comp.name, row.comp.location, row.comp.weight, boardStatus(row), boardConflictText(row)]));
}

async function exportDashboardPdf(section) {
    if (!currentUser || !userData) return;
    if (['competition-board', 'notifications'].includes(section) && !isCoach && !isAdmin) return;
    const titles = { overview: 'pdf_mine', profile: 'pdf_personal', documents: 'dash_documents', videos: 'dash_videos', competitions: 'dash_competitions', schedule: 'cd_schedule', strength: 'cd_strength', training: 'cd_training', feedback: 'cd_feedback', notifications: 'cn_title' };
    await withPdfButton(`pdf-${section}`, async () => {
        const uid = currentUser.uid;
        const data = JSON.parse(JSON.stringify(userData));
        const filters = section === 'competition-board' ? boardFilters() : null;
        if (filters && (competitionBoardState !== 'ready' || (filters.from && filters.to && filters.from > filters.to))) throw new Error('board not ready');
        const rows = filters ? RockyCompetitions.filterRows(competitionBoardRows, filters) : null;
        const inbox = coachInbox.slice();
        const doc = await createPdfDoc(section === 'competition-board' ? 'landscape' : 'portrait');
        // Do not finish an export if the account or staff permission changed while loading fonts.
        if (!currentUser || currentUser.uid !== uid || (['competition-board', 'notifications'].includes(section) && !isCoach && !isAdmin)) return;
        const w = pdfWriter(doc);
        if (section === 'competition-board') writeCompetitionBoardPdf(w, rows, filters);
        else if (section === 'notifications') {
            if (!coachInboxReady || coachInboxError) throw new Error('inbox not ready');
            w.h1(T('cn_title'));
            w.muted(`${T('pdf_generated')}: ${new Date().toLocaleString(langLocale())}`);
            inbox.forEach(n => {
                w.h2(n.kind === 'contact' ? n.name : n.fromName);
                w.muted(fmtDateTime(n.createdAt));
                const text = document.createElement('div'); text.innerHTML = coachNotifText(n);
                w.text(text.textContent);
                w.muted(n.isRead ? T('cn_read') : T('home_new'));
            });
            if (!inbox.length) w.muted(T('cn_empty'));
        } else {
            if (!titles[section]) throw new Error('unknown section');
            athleteSections(w, data, section === 'overview' ? null : section);
        }
        w.finish();
        doc.save(`Rocky_${pdfSafeFilename(section)}_${RockyCompetitions.todayKey()}.pdf`);
        showToast(T('pdf_done'), 'success');
    });
}
