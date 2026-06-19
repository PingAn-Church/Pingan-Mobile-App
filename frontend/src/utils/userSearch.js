/**
 * Case-insensitive match of a user against a search term, checking the full
 * name (first + last) and email. An empty/blank term matches everyone.
 */
export const userMatchesSearch = (user, term) => {
  const q = (term || "").trim().toLowerCase();
  if (!q) return true;
  const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.toLowerCase();
  const email = (user?.email ?? "").toLowerCase();
  return name.includes(q) || email.includes(q);
};
