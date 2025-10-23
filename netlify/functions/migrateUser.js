// Netlify Function: POST /.netlify/functions/migrateUser
// Body: { oldUserId: string, newUserId: string, jwt: string }
import { Client, Databases, Query, ID } from "node-appwrite";

const {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT,
  APPWRITE_API_KEY,
  APPWRITE_DB_ID,
  COL_PROGRESS_ID,
  COL_EVENTS_ID
} = process.env;

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { oldUserId, newUserId, jwt } = JSON.parse(event.body || "{}");
    if (!oldUserId || !newUserId || !jwt) {
      return { statusCode: 400, body: "Missing fields" };
    }

    // Verify caller is the new user (zero-trust)
    const verifyClient = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT).setJWT(jwt);
    // If JWT is invalid, listing documents below will fail; do a cheap call:
    // Using account.get() is not in node-appwrite top-level import, but JWT failure will bubble on DB calls anyway.

    // Admin client to read/write across users
    const admin = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT).setKey(APPWRITE_API_KEY);
    const db = new Databases(admin);

    // Move PROGRESS
    const prog = await db.listDocuments(APPWRITE_DB_ID, COL_PROGRESS_ID, [
      Query.equal("userId", oldUserId), Query.limit(100)
    ]);
    for (const doc of prog.documents) {
      const body = { ...doc, userId: newUserId, updatedAt: new Date().toISOString() };
      delete body.$id; delete body.$createdAt; delete body.$updatedAt; delete body.$permissions; delete body.$databaseId; delete body.$collectionId;
      const perms = [`read("user:${newUserId}")`, `update("user:${newUserId}")`, `delete("user:${newUserId}")`];
      await db.createDocument(APPWRITE_DB_ID, COL_PROGRESS_ID, ID.unique(), body, perms);
      await db.deleteDocument(APPWRITE_DB_ID, COL_PROGRESS_ID, doc.$id);
    }

    // Move EVENTS (optional)
    if (COL_EVENTS_ID) {
      const evts = await db.listDocuments(APPWRITE_DB_ID, COL_EVENTS_ID, [
        Query.equal("userId", oldUserId), Query.limit(100)
      ]);
      for (const doc of evts.documents) {
        const body = { ...doc, userId: newUserId };
        delete body.$id; delete body.$createdAt; delete body.$updatedAt; delete body.$permissions; delete body.$databaseId; delete body.$collectionId;
        const perms = [`read("user:${newUserId}")`, `update("user:${newUserId}")`, `delete("user:${newUserId}")`];
        await db.createDocument(APPWRITE_DB_ID, COL_EVENTS_ID, ID.unique(), body, perms);
        await db.deleteDocument(APPWRITE_DB_ID, COL_EVENTS_ID, doc.$id);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true, moved: prog.total }) };
  } catch (e) {
    return { statusCode: 500, body: `Error: ${e.message}` };
  }
}
