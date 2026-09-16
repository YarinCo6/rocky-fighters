// Rocky Fighters push relay — Cloudflare Worker.
//
// The static site cannot hold server credentials, so this tiny endpoint is the
// only thing allowed to talk to FCM. It verifies WHO is asking (Firebase ID
// token), decides WHO may be notified (coach → athlete, athlete → coaches,
// contact form → coaches), composes the message text itself (clients never
// choose the text), reads device tokens from Firestore with a service account,
// and sends through FCM HTTP v1.
//
// Secrets (wrangler secret put): FIREBASE_SA (service-account JSON),
// FIREBASE_WEB_API_KEY, ADMIN_EMAIL. Vars: PROJECT_ID, SITE_URL, ALLOWED_ORIGINS.

const KINDS = {
  // coach/admin → one athlete
  feedback:      { he: ['משוב חדש מהמאמן', 'קיבלת משוב חדש — כנס לראות'],           en: ['New coach feedback', 'You have new feedback — tap to read'],            de: ['Neues Trainer-Feedback', 'Du hast neues Feedback — tippe zum Lesen'] },
  reply:         { he: ['המאמן הגיב לך', 'תגובה חדשה ביומן האימונים / במטרות'],       en: ['Your coach replied', 'New reply on your training log / goals'],          de: ['Dein Trainer hat geantwortet', 'Neue Antwort im Trainingslog / bei den Zielen'] },
  // athlete → all coaches (name filled in server-side)
  athleteUpdate: { he: ['עדכון ממתאמן', '{name} עדכן פרטים / נרשם / הוסיף קישור'], en: ['Athlete update', '{name} updated details / registered / added a link'], de: ['Aktualisierung eines Wettkämpfers', '{name} hat Daten geändert / sich angemeldet / einen Link hinzugefügt'] },
  // public contact form → all coaches
  contact:       { he: ['הודעה חדשה מטופס צור קשר', '{name} השאיר/ה הודעה באתר'],   en: ['New contact-form message', '{name} left a message on the site'],         de: ['Neue Kontaktformular-Nachricht', '{name} hat eine Nachricht hinterlassen'] },
};

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...extra } });

function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin : 'null',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'vary': 'origin',
  };
}

// ---------- Google OAuth2 for the service account (RS256 JWT → access token) ----------
let cachedToken = { value: null, exp: 0 };

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken.value && cachedToken.exp - 60 > now) return cachedToken.value;
  const sa = JSON.parse(env.FIREBASE_SA);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${b64url(sig)}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token exchange failed: ' + JSON.stringify(j).slice(0, 200));
  cachedToken = { value: j.access_token, exp: now + (j.expires_in || 3600) };
  return j.access_token;
}

// ---------- Firestore REST helpers ----------
const fsBase = (env) => `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents`;

function fromValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  return null;
}
function fromFields(fields) { const o = {}; for (const [k, v] of Object.entries(fields || {})) o[k] = fromValue(v); return o; }

async function fsGet(env, token, path) {
  const r = await fetch(`${fsBase(env)}/${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  const j = await r.json();
  if (j.error) throw new Error('firestore get: ' + j.error.message);
  return { id: j.name.split('/').pop(), ...fromFields(j.fields) };
}

async function fsQuery(env, token, collection, where, limit = 100) {
  const filters = where.map(([field, op, value]) => ({
    fieldFilter: { field: { fieldPath: field }, op, value: typeof value === 'string' ? { stringValue: value } : { arrayValue: { values: value.map(s => ({ stringValue: s })) } } },
  }));
  const body = { structuredQuery: { from: [{ collectionId: collection }], limit,
    where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } } } };
  const r = await fetch(`${fsBase(env)}:runQuery`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const rows = await r.json();
  if (rows.error) throw new Error('firestore query: ' + rows.error.message);
  return rows.filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), ...fromFields(x.document.fields) }));
}

async function fsDelete(env, token, path) {
  await fetch(`${fsBase(env)}/${path}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

// ---------- Firebase ID token verification (official REST endpoint) ----------
async function verifyIdToken(env, idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 4096) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }),
  });
  const j = await r.json();
  const u = j.users && j.users[0];
  if (!u) return null;
  return { uid: u.localId, email: (u.email || '').toLowerCase(), emailVerified: !!u.emailVerified };
}

// ---------- FCM send ----------
async function sendPush(env, token, deviceTokens, title, body, link) {
  let sent = 0;
  const dead = [];
  await Promise.all(deviceTokens.map(async (t) => {
    const msg = {
      message: {
        token: t,
        notification: { title, body },
        webpush: {
          headers: { Urgency: 'high', TTL: '86400' },
          notification: { title, body, icon: `${env.SITE_URL}images/rocky-icon.png`, badge: `${env.SITE_URL}images/rocky-icon.png`, lang: 'he', dir: 'rtl', tag: 'rocky', renotify: true },
          fcm_options: { link },
        },
      },
    };
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${env.PROJECT_ID}/messages:send`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(msg),
    });
    if (r.ok) { sent++; return; }
    const e = await r.json().catch(() => ({}));
    const code = e.error && e.error.details && e.error.details.find(d => d.errorCode) ? e.error.details.find(d => d.errorCode).errorCode : (e.error && e.error.status);
    if (code === 'UNREGISTERED' || code === 'NOT_FOUND' || code === 'INVALID_ARGUMENT') dead.push(t);
  }));
  return { sent, dead };
}

// ---------- Simple per-isolate cooldown (best-effort abuse damper) ----------
const lastSend = new Map();
function cooldown(key, ms) {
  const now = Date.now();
  const prev = lastSend.get(key) || 0;
  if (now - prev < ms) return false;
  lastSend.set(key, now);
  if (lastSend.size > 5000) lastSend.clear();
  return true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const cors = corsHeaders(env, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
    if (cors['access-control-allow-origin'] === 'null') return json({ error: 'origin' }, 403, cors);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400, cors); }
    const kind = String(body.kind || '');
    if (!KINDS[kind]) return json({ error: 'kind' }, 400, cors);

    try {
      const token = await getAccessToken(env);
      let targets = [];       // user ids to notify
      let nameForText = '';
      let senderKey = '';

      if (kind === 'contact') {
        // Unauthenticated, but must point at a contact message written in the last 2 minutes
        // (the write itself was already validated by Firestore rules).
        const id = String(body.refId || '');
        if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return json({ error: 'ref' }, 400, cors);
        const doc = await fsGet(env, token, `contactMessages/${id}`);
        if (!doc || !doc.createdAt || Date.now() - Date.parse(doc.createdAt) > 2 * 60 * 1000) return json({ error: 'ref' }, 400, cors);
        nameForText = String(doc.name || '').slice(0, 60);
        senderKey = 'contact:' + id;
        if (!cooldown(senderKey, 60 * 1000)) return json({ ok: true, sent: 0, skipped: 'dup' }, 200, cors);
        targets = await coachUids(env, token);
      } else {
        const user = await verifyIdToken(env, body.idToken);
        if (!user) return json({ error: 'auth' }, 401, cors);
        const me = await fsGet(env, token, `users/${user.uid}`);
        const isAdmin = user.email === (env.ADMIN_EMAIL || '').toLowerCase() && user.emailVerified;
        const isCoach = !!me && me.role === 'coach';
        senderKey = `${kind}:${user.uid}`;

        if (kind === 'feedback' || kind === 'reply') {
          if (!isCoach && !isAdmin) return json({ error: 'forbidden' }, 403, cors);
          const to = String(body.targetUid || '');
          if (!/^[A-Za-z0-9]{10,128}$/.test(to)) return json({ error: 'target' }, 400, cors);
          if (!cooldown(senderKey + ':' + to, 15 * 1000)) return json({ ok: true, sent: 0, skipped: 'cooldown' }, 200, cors);
          targets = [to];
        } else if (kind === 'athleteUpdate') {
          if (!me) return json({ error: 'forbidden' }, 403, cors);
          nameForText = String(me.nameHe || me.name || me.nameEn || '').slice(0, 60);
          if (!cooldown(senderKey, 60 * 1000)) return json({ ok: true, sent: 0, skipped: 'cooldown' }, 200, cors);
          targets = (await coachUids(env, token)).filter(u => u !== user.uid);
        }
      }

      if (targets.length === 0) return json({ ok: true, sent: 0 }, 200, cors);

      // Device tokens for the targets (Firestore 'in' allows up to 30 values).
      const devices = [];
      for (let i = 0; i < targets.length; i += 30) {
        devices.push(...await fsQuery(env, token, 'pushTokens', [['uid', 'IN', targets.slice(i, i + 30)]], 300));
      }
      if (devices.length === 0) return json({ ok: true, sent: 0 }, 200, cors);

      // Per-device language.
      let sent = 0;
      const byLang = {};
      for (const d of devices) (byLang[KINDS[kind][d.lang] ? d.lang : 'he'] ||= []).push(d.id);
      for (const [lang, toks] of Object.entries(byLang)) {
        const [title, tpl] = KINDS[kind][lang];
        const text = tpl.replace('{name}', nameForText || (lang === 'he' ? 'מישהו' : 'Someone'));
        const res = await sendPush(env, token, toks, title, text, env.SITE_URL);
        sent += res.sent;
        await Promise.all(res.dead.map(t => fsDelete(env, token, `pushTokens/${encodeURIComponent(t)}`)));
      }
      return json({ ok: true, sent }, 200, cors);
    } catch (e) {
      console.error(e && e.message);
      return json({ error: 'server' }, 500, cors);
    }
  },
};

async function coachUids(env, token) {
  const coaches = await fsQuery(env, token, 'users', [['role', 'EQUAL', 'coach']], 100);
  const ids = coaches.map(c => c.id);
  // Admin gets coach notifications too.
  if (env.ADMIN_EMAIL) {
    const admins = await fsQuery(env, token, 'users', [['email', 'EQUAL', env.ADMIN_EMAIL]], 2);
    admins.forEach(a => { if (!ids.includes(a.id)) ids.push(a.id); });
  }
  return ids;
}
