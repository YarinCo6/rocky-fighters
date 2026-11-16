/* Browser regression suite. Run with Playwright installed (or NODE_PATH pointing to its bundle).
   Firebase is replaced in the local test server; this suite never accesses production data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const output = process.env.ROCKY_QA_OUTPUT || path.join(root, '..', 'output', 'rocky-competition-qa');

async function main() {
    fs.mkdirSync(output, { recursive: true });
    const server = http.createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.png': 'image/png' };
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
        const body = fs.readFileSync(file);
        res.end(file.endsWith('index.html') ? body.toString().replace(/<script[^>]+src="https:\/\/www\.gstatic\.com\/firebasejs[^>]*><\/script>/g, '') : body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.ROCKY_CHROMIUM_PATH }).catch(error => { server.close(); throw error; });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/firestore\.googleapis|identitytoolkit\.googleapis|rocky-push\./, route => { throw new Error(`Unexpected production request: ${route.request().url()}`); });
    await page.addInitScript(() => {
        const listeners = new Set();
        const coach = { nameHe: 'מאמן בדיקה', nameEn: 'QA Coach', role: 'coach', email: 'qa@example.test', competitions: [] };
        const future = new Date(); future.setFullYear(future.getFullYear() + 1);
        const day = `${future.getFullYear()}-06-20`;
        const event = (name, location = 'תל אביב') => ({ name, dateISO: day, date: `20/06/${future.getFullYear()}`, location, weight: 'עד 70 ק״ג', status: 'pending' });
        const athlete = { nameHe: 'דנה כהן', nameEn: 'Dana Cohen', role: 'competitor', gym: 'Rocky', competitions: [event('אליפות ישראל'), event('גביע הצפון', 'חיפה')], weeklySchedule: [{ day: 0, start: '09:00', end: '10:00', type: 'אימון טכניקה' }], trainingLog: Array.from({ length: 35 }, (_, i) => ({ id: `log${i}`, date: `${future.getFullYear()}-01-${String(i % 28 + 1).padStart(2, '0')}`, workedOn: `Training entry ${i}`, worked: 'עבד היטב', coachComment: 'הערת מאמן' })), coachFeedback: Array.from({ length: 35 }, (_, i) => ({ text: `Feedback entry ${i}`, coach: 'QA', date: '01/01/2027', ack: true })), weightHistory: Array.from({ length: 30 }, (_, i) => ({ month: `Month ${i}`, value: 70 })) };
        window.__users = { coach, dana: athlete, noa: { nameHe: 'נועה לוי', nameEn: 'Noa Levi', role: 'competitor', competitions: [event('אליפות ישראל')] } };
        window.__failBoard = false;
        const docSnap = id => ({ id, exists: Boolean(window.__users[id]), data: () => window.__users[id], metadata: { hasPendingWrites: false } });
        const snapshot = ids => ({ forEach: fn => ids.forEach(id => fn(docSnap(id))), docChanges: () => [] });
        const query = (collection, id, filter) => ({
            doc: uid => query(collection, uid),
            where: (field, op, value) => query(collection, null, { field, value }), orderBy() { return this; }, limit() { return this; },
            get: async () => id ? docSnap(id) : snapshot(collection === 'users' ? Object.keys(window.__users).filter(uid => !filter || window.__users[uid][filter.field] === filter.value) : []),
            onSnapshot(next, error) {
                const entry = { collection, id, next, error };
                listeners.add(entry);
                setTimeout(() => {
                    if (!listeners.has(entry)) return;
                    if (collection === 'users' && !id && window.__failBoard) error(new Error('simulated failure'));
                    else next(id ? docSnap(id) : snapshot(collection === 'users' ? Object.keys(window.__users) : []));
                });
                return () => listeners.delete(entry);
            },
            update: async () => { throw new Error('Unexpected database write in QA'); }
        });
        window.__emitUsers = () => listeners.forEach(entry => { if (entry.collection === 'users') entry.next(entry.id ? docSnap(entry.id) : snapshot(Object.keys(window.__users))); });
        window.__boardListenerCount = () => [...listeners].filter(entry => entry.collection === 'users' && !entry.id).length;
        const authMock = { currentUser: null, onAuthStateChanged: fn => { window.__authChanged = fn; setTimeout(() => fn(null)); }, signOut: async () => { authMock.currentUser = null; await window.__authChanged(null); } };
        window.__login = async uid => { authMock.currentUser = { uid, email: 'qa@example.test', emailVerified: true, providerData: [{ providerId: 'password' }] }; await window.__authChanged(authMock.currentUser); };
        window.firebase = { initializeApp() {}, auth: () => authMock, firestore: () => ({ collection: name => query(name) }) };
    });
    try {
        await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => window.__login('coach'));
        await page.locator('#competitionBoardBtn').click();
        await page.waitForFunction(() => competitionBoardState === 'ready');
        assert.equal(await page.locator('.planner-table tbody tr').count(), 3);
        assert.equal(await page.locator('.planner-overlap').count(), 3);
        assert.match(await page.locator('#boardResults').textContent(), /2 משתתפים/);
        await page.locator('#boardAthlete').selectOption('noa');
        assert.equal(await page.locator('.planner-table tbody tr').count(), 1);
        assert.match(await page.locator('#boardResults').textContent(), /גביע הצפון/); // warning survives filtering
        await page.locator('#boardFrom').fill('2099-02-01');
        await page.locator('#boardTo').fill('2099-01-01');
        assert.equal(await page.locator('#pdf-competition-board').isDisabled(), true);
        await page.evaluate(() => resetCompetitionBoardFilters());
        await page.screenshot({ path: path.join(output, 'board-hebrew-desktop.png'), fullPage: true });
        const pdf = page.waitForEvent('download');
        await page.locator('#pdf-competition-board').click();
        await (await pdf).saveAs(path.join(output, 'competition-board-he.pdf'));
        // Live update and safe rendering of user-supplied names.
        await page.evaluate(() => { window.__users.noa.competitions.push({ name: '<img src=x onerror=alert(1)>', date: '21/06/2099', location: 'QA' }); window.__emitUsers(); });
        await page.waitForFunction(() => document.querySelectorAll('.planner-table tbody tr').length === 4);
        assert.equal(await page.locator('#boardResults img').count(), 0);
        for (const lang of ['en', 'de', 'he']) {
            await page.evaluate(value => setLang(value), lang);
            assert.equal(await page.locator('#pdf-competition-board span').textContent(), await page.evaluate(() => T('board_filtered_pdf')));
            if (lang !== 'he') {
                const translatedDownload = page.waitForEvent('download');
                await page.locator('#pdf-competition-board').click();
                await (await translatedDownload).saveAs(path.join(output, `competition-board-${lang}.pdf`));
            }
        }
        await page.evaluate(() => showCompetitorDetail('dana'));
        const athleteDownload = page.waitForEvent('download');
        await page.locator('#exportOneBtn').click();
        await (await athleteDownload).saveAs(path.join(output, 'staff-athlete-he.pdf'));
        await page.evaluate(() => closeCompetitorDetail());
        await page.evaluate(() => switchPanel('coach'));
        const rosterDownload = page.waitForEvent('download');
        await page.locator('#exportAllBtn').click();
        await (await rosterDownload).saveAs(path.join(output, 'staff-roster-he.pdf'));
        await page.evaluate(() => switchPanel('notifications'));
        const inboxDownload = page.waitForEvent('download');
        await page.locator('#pdf-notifications').click();
        await (await inboxDownload).saveAs(path.join(output, 'staff-inbox-he.pdf'));
        await page.evaluate(() => switchPanel('competition-board'));
        await page.waitForFunction(() => competitionBoardState === 'ready');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(350); // Let the existing sidebar's responsive transition settle.
        await page.evaluate(() => closeSidebar());
        await page.screenshot({ path: path.join(output, 'board-hebrew-mobile.png'), fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        assert.equal(await page.evaluate(() => document.querySelector('.planner-wrap').scrollWidth > document.querySelector('.planner-wrap').clientWidth), true);
        await page.evaluate(() => switchPanel('overview'));
        assert.equal(await page.evaluate(() => window.__boardListenerCount()), 0);
        await page.evaluate(() => { window.__failBoard = true; switchPanel('competition-board'); });
        await page.waitForFunction(() => competitionBoardState === 'error');
        assert.equal(await page.locator('#pdf-competition-board').isDisabled(), true);
        await page.evaluate(() => { window.__failBoard = false; startCompetitionBoard(true); });
        await page.waitForFunction(() => competitionBoardState === 'ready');
        await page.evaluate(() => { window.__users.coach.role = 'competitor'; window.__emitUsers(); });
        assert.equal(await page.evaluate(() => currentPanel()), 'overview');
        assert.equal(await page.evaluate(() => window.__boardListenerCount()), 0);
        assert.equal(await page.locator('#competitionBoardBtn').isVisible(), false);
        await page.evaluate(() => switchPanel('competition-board'));
        assert.equal(await page.evaluate(() => currentPanel()), 'overview');
        await page.evaluate(() => logout());
        await page.evaluate(() => window.__login('dana'));
        assert.equal(await page.locator('#competitionBoardBtn').isVisible(), false);
        for (const section of ['profile', 'documents', 'videos', 'competitions', 'schedule', 'strength', 'training', 'feedback', 'overview']) {
            await page.evaluate(value => switchPanel(value), section);
            assert.equal(await page.locator(`#pdf-${section}`).isVisible(), true);
            const downloadPromise = page.waitForEvent('download');
            await page.locator(`#pdf-${section}`).click();
            await (await downloadPromise).saveAs(path.join(output, `${section}-he.pdf`));
        }
        // Stress row wrapping, long free text and schedule continuation on multiple pages.
        const stressDownload = page.waitForEvent('download');
        await page.evaluate(async () => {
            const doc = await createPdfDoc(); const w = pdfWriter(doc);
            w.h1('בדיקת עימוד');
            w.table(['שם התחרות', 'מיקום'], [['תחרות ארוכה '.repeat(200), 'תל אביב']]);
            w.weekGrid(Array.from({ length: 100 }, (_, i) => ({ day: 0, start: '09:00', end: '10:00', type: `אימון ${i}` })));
            w.text('Long paragraph '.repeat(2000));
            w.finish(); doc.save('stress.pdf');
        });
        await (await stressDownload).saveAs(path.join(output, 'stress-he.pdf'));
        assert.deepEqual(errors, []);
        console.log('PASS: coach board, filters, overlaps, live updates, errors/retry, role changes, mobile layout, 3 languages and all personal PDF downloads.');
        console.log(`QA artifacts: ${output}`);
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
