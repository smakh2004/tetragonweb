/* =====================================================
   TETRAGON — who is the site admin
   Must match isAdmin() in D:\Website\firestore.rules.
   (The page check is only cosmetic — the Firestore rules are
   what actually stop anyone else from reading the data.)
===================================================== */
export const ADMIN_EMAILS = ["tursunmukhammad2302@gmail.com"];

export function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(String(email).toLowerCase());
}
