/* Minimal Appwrite saved-progress + login helper for static Eleventy */
import { Client, Account, Databases, ID, Query } from "https://cdn.jsdelivr.net/npm/appwrite@13.0.0/dist/index.js";

/** ==== CONFIG (env-injected by Eleventy or hardcode for local) ==== */
const APPWRITE_ENDPOINT = window.APPWRITE_ENDPOINT;   // e.g. "https://cloud.appwrite.io/v1"
const APPWRITE_PROJECT  = window.APPWRITE_PROJECT;    // your project ID
const APPWRITE_DB_ID    = window.APPWRITE_DB_ID;      // e.g. "main"
const COL_PROGRESS_ID   = window.COL_PROGRESS_ID;     // "progress"
const COL_EVENTS_ID     = window.COL_EVENTS_ID;       // "events" (optional)

const client   = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT);
const account  = new Account(client);
const db       = new Databases(client);

/** ===== Small utils ===== */
const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
const debounce = (fn, wait=500)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };
const getStepFromURL = ()=> {
  const u = new URL(location.href);
  const n = parseInt(u.searchParams.get("step")||"1",10);
  return Number.isFinite(n)&&n>0? n:1;
};
const setStepInURL = (n)=> {
  const u = new URL(location.href);
  u.searchParams.set("step", String(n));
  history.replaceState({}, "", u);
};

const LS_KEY = (slug)=> `journey:${slug}:progress`;

/** ===== Auth ===== */
export async function ensureSession() {
  try { return await account.get(); }
  catch {
    try { await account.createAnonymousSession(); return await account.get(); }
    catch(e){ console.error("anon session failed", e); throw e; }
  }
}

export async function signInWithMagic(email) {
  // Sends magic link; user returns with session (Appwrite handles)
  await account.createMagicURLSession(ID.unique(), email, location.href);
}

export async function signInWithOAuth(provider="github") {
  const redirect = location.href;
  await account.createOAuth2Session(provider, redirect, redirect);
}

export async function signOut() {
  try { await account.deleteSessions(); } catch(e){/* ignore */} finally { location.reload(); }
}

/** ===== Progress IO ===== */
export async function loadProgress(journeySlug) {
  // local first (offline)
  const cached = localStorage.getItem(LS_KEY(journeySlug));
  if (cached) { try { return JSON.parse(cached); } catch{} }

  // remote
  const me = await ensureSession();
  const res = await db.listDocuments(APPWRITE_DB_ID, COL_PROGRESS_ID, [
    Query.equal("userId", me.$id),
    Query.equal("journeySlug", journeySlug),
    Query.limit(1)
  ]);
  return res.total ? res.documents[0] : null;
}

export async function saveProgress({ journeySlug, step, percent=0, state={} }) {
  const me = await ensureSession();
  const now = new Date().toISOString();
  // upsert by (userId, journeySlug)
  const found = await db.listDocuments(APPWRITE_DB_ID, COL_PROGRESS_ID, [
    Query.equal("userId", me.$id),
    Query.equal("journeySlug", journeySlug),
    Query.limit(1)
  ]);

  const body = {
    userId: me.$id,
    journeySlug,
    step,
    percent,
    state,
    updatedAt: now
  };

  // keep local copy for offline
  localStorage.setItem(LS_KEY(journeySlug), JSON.stringify(body));

  const perms = [ // ensure document-level isolation
    `read("user:${me.$id}")`,
    `update("user:${me.$id}")`,
    `delete("user:${me.$id}")`
  ];

  if (found.total) {
    return await db.updateDocument(APPWRITE_DB_ID, COL_PROGRESS_ID, found.documents[0].$id, body, perms);
  }
  return await db.createDocument(APPWRITE_DB_ID, COL_PROGRESS_ID, ID.unique(), body, perms);
}
export const saveProgressDebounced = debounce(saveProgress, 600);

/** ===== Events (optional analytics) ===== */
export async function trackEvent({journeySlug, step, eventType, meta={}}) {
  if (!COL_EVENTS_ID) return;
  try {
    const me = await ensureSession();
    const perms = [`read("user:${me.$id}")`, `update("user:${me.$id}")`, `delete("user:${me.$id}")`];
    await db.createDocument(APPWRITE_DB_ID, COL_EVENTS_ID, ID.unique(), {
      userId: me.$id, journeySlug, step, eventType, meta, ts: new Date().toISOString()
    }, perms);
  } catch (e) { /* non-fatal */ }
}

/** ===== Resume helper ===== */
export async function offerResume({ journeySlug, mountSelector="#resume-toast" }) {
  const p = await loadProgress(journeySlug);
  if (!p || (p.step||1) <= getStepFromURL()) return;
  const el = document.querySelector(mountSelector);
  if (!el) return;
  el.style.display = "block";
  el.querySelector("[data-resume]").addEventListener("click", ()=>{
    setStepInURL(p.step);
    el.style.display = "none";
    trackEvent({journeySlug, step:p.step, eventType:"resume_click"});
    location.reload();
  });
  el.querySelector("[data-dismiss]").addEventListener("click", ()=>{
    el.style.display = "none";
    trackEvent({journeySlug, step:p.step, eventType:"resume_dismiss"});
  });
}

/** ===== Bind step changes (call this from your step router) ===== */
export function onStepChange({ journeySlug, step, percent=0, state={} }) {
  setStepInURL(step);
  saveProgressDebounced({ journeySlug, step, percent, state });
  trackEvent({ journeySlug, step, eventType:"step_change" });
}

/** ===== Expose helpers on window for simplicity in Eleventy templates ===== */
window.CDCProgress = {
  ensureSession, signInWithMagic, signInWithOAuth, signOut,
  loadProgress, saveProgress, onStepChange, offerResume, trackEvent
};
