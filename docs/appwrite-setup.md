# Appwrite Setup (realtime, persistence & share links)

The playground runs fully offline by default. The optional **Appwrite** integration adds three things:

1. **Realtime** — change events written by one client appear live in others.
2. **Scenario persistence** — "Save scenario" stores a snapshot in Appwrite.
3. **Share links** — "Copy Share Link" returns a `?scenario=<id>` URL that reloads that snapshot.

This guide is the exact, code-grounded setup needed to make those work. It complements the short "Appwrite configuration surface" in [`configuration-guide.md`](configuration-guide.md).

> **Status (2026-06):** the client-side integration was repaired in #285 (SDK v13 `client.subscribe`, and the **regional** `nyc` endpoint). With that, the client connects and an anonymous session is established. What remains is **server-side**: creating the collections/attributes and granting permissions below. One collection (`scenarios`) also needs a small code change — see [§ Scenario persistence caveat](#scenario-persistence-caveat).

---

## 1. Project & endpoint

`window.APPWRITE_CFG` in [`index.html`](../index.html) drives everything:

| Field | Current value | Notes |
| --- | --- | --- |
| `endpoint` | `https://nyc.cloud.appwrite.io/v1` | **Must be the project's regional endpoint.** The generic `cloud.appwrite.io/v1` returns *"Project is not accessible in this region"* and loops realtime reconnects. This project lives in `nyc`. |
| `projectId` | `68e009780030a983a57d` | |
| `databaseId` | `68e028d90039fa4588f5` | The database holding both collections below. |
| `collectionId` | `events` | Change-event stream (realtime + persistence). |
| `scenarioCollectionId` | `scenarios` | Saved scenario snapshots (save + share). |

## 2. Sessions & permissions model

On load the app calls `account.get()`, then *attempts* `account.createAnonymousSession()` if there's no session (`assets/app.js → initAppwrite`). That attempt is **best-effort** — if it fails the code logs a warning and continues as an unauthenticated guest. So requests run as a guest, an anonymous user, or a logged-in user — never a true API key. Set collection permissions for the role you actually rely on:

- To let any visitor write/read **without login**: grant **Create** and **Read** to `Any`. This works for unauthenticated guests, so an anonymous session is **not required** in this mode.
- For share links to open for *other* people, the `scenarios` collection needs **Read** for `Any`.
- **Anonymous sessions are optional** — enable them (Appwrite Console → Auth → Settings → "Anonymous") only if you scope permissions to `Users` instead of `Any`, or want a distinct per-visitor identity. With `Any` permissions, leaving them off is fine.

> ⚠️ **Security trade-off:** `Create` for `Any` means anyone can write documents. For a public demo that's usually fine, but consider Appwrite's rate limits / abuse protection, or scope to `Users` with a login.

---

## 3. Collection: `events` ✅ (config-only — works with current code)

`publishEvent()` writes one document per change op. It first tries native JSON, then falls back to JSON-**stringified** `before`/`after` if the attributes are strings — so define them as strings.

| Attribute | Type | Size | Required | Notes |
| --- | --- | --- | --- | --- |
| `ts_ms` | integer | — | yes | `Date.now()` at write time |
| `op` | string | 16 | yes | Debezium-style op code — `publishEvent()` always writes one of `c` (create), `r` (read/snapshot), `u` (update), `d` (delete) |
| `before` | string | 1,000,000 | no | row image before, JSON-stringified; nullable |
| `after` | string | 1,000,000 | no | row image after, JSON-stringified; nullable |

- **Permissions:** Create + Read (per § 2).
- **Realtime:** no extra config — `client.subscribe('databases.<db>.collections.events.documents', …)` receives `*.create` events automatically once the collection exists and Read is granted.

With this collection in place, realtime + event persistence work against the current code.

---

## 4. Collection: `scenarios` ⚠️ (needs a small code change too)

`saveScenarioRemote()` writes this snapshot, and the share-load path reads it back:

| Field | Type in code | Appwrite-storable as-is? |
| --- | --- | --- |
| `kind` | string (`"scenario"`) | ✅ string |
| `version` | integer (`2`) | ✅ integer |
| `saved_at` | ISO string | ✅ string/datetime |
| `scenarioId` | string \| null | ✅ string (optional) |
| `officeOptIn` | boolean | ✅ boolean |
| `schema` | **array of objects** | ❌ no native type |
| `rows` | **array of objects** | ❌ no native type |
| `events` | **array of objects** | ❌ no native type |
| `comparator` | **object** | ❌ no native type |

<a id="scenario-persistence-caveat"></a>

### Scenario persistence caveat

Appwrite attributes are typed scalars (or arrays of scalars) — there is **no nested-object/JSON attribute type**. The current code writes `schema`/`rows`/`events`/`comparator` as raw nested objects (`databases.createDocument(..., snapshot)`) and the load path reads them back as raw objects (`doc.schema || []`). Appwrite will reject the raw nested write, which is why "Save scenario" currently surfaces *"Cloud save failed. Check Appwrite configuration."* even after the client connects.

**Two ways to resolve (pick one):**

**Option A — one payload string (smallest change).** Add a single large string attribute and (de)serialize the whole snapshot:
- Attribute: `payload` — string, size `1,000,000`, required.
- Code: in `saveScenarioRemote`, send `{ kind, version, saved_at, scenarioId, payload: JSON.stringify({schema, rows, events, comparator, officeOptIn}) }`; in the share-load path (`assets/app.js` ~L1920) and `importScenario`, `JSON.parse(doc.payload)` before assigning to `state`.

**Option B — per-field string attributes.** Define `schema`, `rows`, `events`, `comparator` as string attributes (size `1,000,000`) and `JSON.stringify` each on save / `JSON.parse` each on load. More columns, but individual fields stay queryable.

Recommended attributes for **Option A**:

| Attribute | Type | Size | Required |
| --- | --- | --- | --- |
| `kind` | string | 32 | yes |
| `version` | integer | — | yes |
| `saved_at` | string | 40 | no |
| `scenarioId` | string | 128 | no |
| `payload` | string | 1,000,000 | yes |

- **Permissions:** Create + Read for `Any` (Read for `Any` is what makes a shared link open for other people).

Until Option A or B lands, **event persistence/realtime (collection `events`) works, but scenario save/share does not.** Track this in [`issues/appwrite-persistence.md`](issues/appwrite-persistence.md).

---

## 5. Quick verification

After creating the collections + permissions:

1. Load the deployed site; open the console. You should see **no** "not accessible in this region" / "not a constructor" / reconnect-loop errors (only a benign localStorage advisory).
2. Fire a few operations in the workspace → documents should appear in the `events` collection (Appwrite Console → Databases → events).
3. Open the same page in a second browser → those events should stream in live (realtime).
4. (After the §4 code change) "Save scenario" → "Copy Share Link" → open the link in a fresh browser → the scenario reloads.

## 6. CLI reference (`appwrite.json`)

A starting point for the Appwrite CLI (`appwrite push collections`). Adjust to your CLI version — the markdown tables above are authoritative.

```jsonc
{
  "projectId": "68e009780030a983a57d",
  "databases": [{ "$id": "68e028d90039fa4588f5", "name": "playground" }],
  "collections": [
    {
      "$id": "events",
      "databaseId": "68e028d90039fa4588f5",
      "name": "events",
      "documentSecurity": false,
      "$permissions": ["create(\"any\")", "read(\"any\")"],
      "attributes": [
        { "key": "ts_ms",  "type": "integer", "required": true },
        { "key": "op",     "type": "string",  "size": 16, "required": true },
        { "key": "before", "type": "string",  "size": 1000000, "required": false },
        { "key": "after",  "type": "string",  "size": 1000000, "required": false }
      ]
    },
    {
      "$id": "scenarios",
      "databaseId": "68e028d90039fa4588f5",
      "name": "scenarios",
      "documentSecurity": false,
      "$permissions": ["create(\"any\")", "read(\"any\")"],
      "attributes": [
        { "key": "kind",       "type": "string",  "size": 32,  "required": true },
        { "key": "version",    "type": "integer", "required": true },
        { "key": "saved_at",   "type": "string",  "size": 40,  "required": false },
        { "key": "scenarioId", "type": "string",  "size": 128, "required": false },
        { "key": "payload",    "type": "string",  "size": 1000000, "required": true }
      ]
    }
  ]
}
```
