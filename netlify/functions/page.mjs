// Public pages: "/" (HU) and "/en/" (EN), rendered from the published content and cached on the CDN until the next publish.
import { getStore } from "@netlify/blobs";
import { render, PAGE_HEADERS } from "./_render.mjs";

export default async (req) => {
  const pathname = new URL(req.url).pathname;
  const lang = pathname.startsWith("/en") ? "en" : pathname.startsWith("/de") ? "de" : "hu";
  let ov = null;
  try {
    const p = await getStore({ name: "cms", consistency: "strong" }).get("published", { type: "json" });
    ov = p && p.overrides ? p.overrides : null;
  } catch { ov = null; } // storage problem: serve the default (original) text, never an error page
  return new Response(req.method === "HEAD" ? null : render(lang, ov), {
    headers: {
      ...PAGE_HEADERS,
      "cache-control": "public, max-age=0, must-revalidate",
      "netlify-cdn-cache-control": "public, s-maxage=31536000, stale-while-revalidate=31536000, durable",
      "cache-tag": "page",
    },
  });
};
export const config = { path: ["/", "/en", "/en/", "/de", "/de/"] };
