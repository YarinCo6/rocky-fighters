# Rocky Fighters

Static Hebrew/English/German dashboard backed by Firebase Auth and Firestore.

## Coach competition calendar

Coaches and admins can open **לוח תחרויות למאמנים / Coach competition calendar** from the dashboard sidebar. It collects registrations from all user documents (including coaches who also compete) and updates through a Firestore listener while the calendar is open. No data migration or additional Firestore permissions are needed.

- Dates are sorted chronologically, accepting existing `DD/MM/YYYY` or `DD.MM.YYYY` strings and ISO dates. New registrations also save `dateISO`.
- Filter by period, athlete, date range, search text, and overlaps. The default shows today onwards; select **All dates** to include history. Missing dates remain visible without a date-range filter and are labelled for review.
- Same-day registrations with matching normalized event name and location are counted as shared participation. Different events on the same day are flagged, with a stronger warning when one athlete has multiple events. Cancelled events do not create conflicts.
- Overlaps are calculated against the whole roster before filtering. This is a day-level planning warning: competition times are not stored. Different spellings of an event or location can require manual review.
- Select an athlete's name to open their existing detail card.
- **Download filtered table (PDF)** exports the selected rows, filter context and overlap details in a landscape report.

## PDF downloads

Every personal dashboard section has a direct PDF button: profile/weight history, documents, video links, competitions, weekly schedule, strength program, training journal/goals, and coach feedback. The home screen exports the user's complete report. Staff retain individual-athlete and complete-roster exports and can export their visible notification inbox. Document/video entries retain clickable source links.

Reports use the bundled Heebo fonts for Hebrew, English and German. Tables wrap long values, repeat headers and continue across pages; weekly grids and long paragraphs also paginate. History is exported in full rather than truncating to recent entries. The PDF library is loaded on demand from the existing pinned CDN URL.

## Verification

No build step is required. Serve this directory with a static HTTP server.

```sh
node --test tests/competition-planner.test.cjs
node tests/dashboard.test.cjs
```

The browser suite requires Playwright and its Chromium browser (`npm install --no-save playwright`, then `npx playwright install chromium`), or an existing installation through `NODE_PATH`. Set `ROCKY_CHROMIUM_PATH` to use an existing Chromium executable and `ROCKY_QA_OUTPUT` to choose the screenshot/PDF output directory.

The browser suite substitutes Firebase entirely in its local server. It checks staff access, overlap semantics, filters, live updates, listener cleanup, error recovery, role revocation, mobile overflow, three languages, and PDF downloads. It does not read or write production data.
