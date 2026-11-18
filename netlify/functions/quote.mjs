import { store, json, bad, checkStay, freeApartments, PRICE, APTS } from "./_lib.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const inn = u.searchParams.get("in"), out = u.searchParams.get("out");
  const guests = u.searchParams.get("guests") || "2", apt = u.searchParams.get("apt") || "haz-any";
  const c = checkStay(inn, out, guests, apt);
  if (c.error) return json({ ok: false, error: c.error }, c.error === "phone_only" ? 200 : 400);
  const free = await freeApartments(store(), c.nights, apt);
  return json({
    ok: true, nights: c.n, perNight: PRICE, amount: PRICE * c.n, currency: "HUF",
    free, freeNames: free.map((a) => APTS[a]), available: free.length > 0,
  });
};
export const config = { path: "/api/quote" };
