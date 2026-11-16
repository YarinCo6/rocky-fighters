const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const context = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.join(root, 'competition-planner.js'), 'utf8'), context);
const { dateKey, buildRows, filterRows, todayKey } = context.module.exports;
const comp = (name, date, location = 'תל אביב', status = 'pending') => ({ name, date, location, status });

test('parses legacy and ISO calendar dates without timezone conversion or invalid-day rollover', () => {
    assert.equal(dateKey('2/1/2027'), '2027-01-02');
    assert.equal(dateKey('02.01.2027'), '2027-01-02');
    assert.equal(dateKey('2028-02-29'), '2028-02-29');
    for (const value of ['29/02/2027', '31/04/2027', '2027-13-01', '2027-00-01', '', 'unknown']) assert.equal(dateKey(value), '');
    assert.equal(todayKey(new Date(2027, 0, 2, 0, 1)), '2027-01-02');
});

test('sorts across months and years; unknown dates remain visible at the end', () => {
    const rows = buildRows([{ id: 'a', competitions: [comp('Jan', '01/01/2028'), comp('Dec', '31/12/2027'), comp('Feb', '02/02/2027'), comp('Missing', '')] }]);
    assert.deepEqual(Array.from(rows, r => r.comp.name), ['Feb', 'Dec', 'Jan', 'Missing']);
});

test('shared event participants are counted once per athlete and do not create false overlaps', () => {
    const rows = buildRows([
        { id: 'a', competitions: [comp('  OPEN  Cup ', '01/01/2027'), comp('open cup', '2027-01-01')] },
        { id: 'b', competitions: [comp('open cup', '01/01/2027')] }
    ]);
    assert.ok(rows.every(row => !row.overlap && !row.athleteOverlap && row.participants === 2));
});

test('flags separate events, including one athlete double-booked, before filtering', () => {
    const rows = buildRows([
        { id: 'a', competitions: [comp('Cup', '01/01/2027'), comp('Championship', '01/01/2027', 'חיפה')] },
        { id: 'b', competitions: [comp('Cup', '01/01/2027')] }
    ]);
    assert.ok(rows.every(row => row.overlap));
    assert.ok(rows.filter(row => row.user.id === 'a').every(row => row.athleteOverlap));
    const filtered = filterRows(rows, { athlete: 'b', search: 'Cup', overlapsOnly: true });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].otherEvents[0].name, 'Championship');
    assert.equal(filtered[0].athleteOverlap, false);
});

test('distinguishes same-named events at different locations and ignores cancelled events for conflicts', () => {
    const rows = buildRows([{ id: 'a', competitions: [comp('Cup', '01/01/2027'), comp('Cup', '01/01/2027', 'חיפה'), comp('Cancelled', '02/01/2027', '', 'cancelled'), comp('Solo', '02/01/2027')] }]);
    assert.ok(rows.filter(row => row.date === '2027-01-01').every(row => row.overlap));
    assert.ok(rows.filter(row => row.date === '2027-01-02').every(row => !row.overlap));
});

test('filters dates inclusively, excludes completed/past from upcoming and preserves undated registrations', () => {
    const rows = buildRows([{ id: 'a', nameHe: 'דנה', gym: 'Rocky', competitions: [comp('Past', '01/01/2027'), comp('Today', '02/01/2027'), comp('Future', '03/01/2027'), comp('Done', '04/01/2027', '', 'done'), comp('Missing', '')] }]);
    assert.deepEqual(Array.from(filterRows(rows, { period: 'upcoming' }, '2027-01-02'), r => r.comp.name), ['Today', 'Future', 'Missing']);
    assert.equal(filterRows(rows, { from: '2027-01-02', to: '2027-01-03', search: 'דנה' }).length, 2);
    assert.equal(filterRows(rows, { period: 'past' }, '2027-01-02').length, 1);
    assert.equal(filterRows(rows, { from: '2027-02-01', to: '2027-01-01' }).length, 0);
});

test('accepts legacy documents with missing arrays and prefers a valid ISO date with legacy fallback', () => {
    const rows = buildRows([{ id: 'a' }, { id: 'b', competitions: [null, { ...comp('ISO', '02/01/2027'), dateISO: '2027-01-03' }, { ...comp('Fallback', '04/01/2027'), dateISO: 'bad' }] }]);
    assert.deepEqual(Array.from(rows, row => row.date), ['2027-01-03', '2027-01-04']);
});

test('all shipped scripts compile', () => {
    for (const name of ['index.html', 'coach-tools.js', 'competition-planner.js']) {
        const source = fs.readFileSync(path.join(root, name), 'utf8');
        const scripts = name.endsWith('.html') ? [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]) : [source];
        scripts.forEach(script => new vm.Script(script, { filename: name }));
    }
});
