import { store, json, bad, getBooking, publicView, cancelHold } from "./_lib.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get("id"), t = u.searchParams.get("t");
  if (!id || !t) return bad("id and t required");
  const st = store();
  let b = await getBooking(st, id);
  if (!b || b.token !== t) return bad("not found", 404, "not_found");
  if (b.status === "pending" && Date.now() - Date.parse(b.created) > 31 * 60000) b = await cancelHold(st, id, "expired");
  return json({ ok: true, booking: publicView(b) });
};
export const config = { path: "/api/booking" };
