import { guideRepair, type RepairResearchItem } from "@/lib/engines/repair-research";

const trustedHosts = ["nhtsa.gov", "toyota.com", "aaa.com", "consumerreports.org", "carcare.org", "bridgestonetire.com", "michelinman.com"];
const decode = (value: string) => value
  .replace(/&amp;/g, "&")
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;|&#34;/g, '"')
  .replace(/&rsquo;|&#8217;/g, "’")
  .replace(/&ldquo;|&#8220;/g, "“")
  .replace(/&rdquo;|&#8221;/g, "”")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/<[^>]+>/g, "")
  .replace(/\s+/g, " ")
  .trim();

function hostLabel(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Source"; }
}

function trusted(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return trustedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch { return false; }
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
      },
      cache: "no-store",
    });
    return response.ok ? await response.text() : "";
  } catch { return ""; } finally { clearTimeout(timer); }
}

function parseYahooResults(html: string) {
  const results: { title: string; url: string }[] = [];
  // Yahoo wraps result destinations in a redirect URL whose RU segment contains the
  // percent-encoded canonical URL. Scoping to anchors containing a result h3 avoids
  // parsing header, ad, and navigation links.
  const pattern = /<a[^>]+href="(https:\/\/r\.search\.yahoo\.com\/[^"#]+)"[^>]*>([\s\S]*?<h3[\s\S]*?<\/h3>)[\s\S]*?<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const encodedUrl = match[1].match(/\/RU=([^/]+)\/RK=/i)?.[1];
    if (!encodedUrl) continue;
    let url: string;
    try { url = decodeURIComponent(encodedUrl); } catch { continue; }
    const title = decode(match[2].match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? "");
    if (title && !results.some((item) => item.url === url)) results.push({ title, url });
  }
  return results;
}

async function searchYahoo(query: string) {
  const html = await fetchText(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}`);
  return parseYahooResults(html);
}

async function trustedResults(query: string): Promise<RepairResearchItem[]> {
  const siteQuery = trustedHosts.map((host) => `site:${host}`).join(" OR ");
  const results = await searchYahoo(`${query} (${siteQuery}) repair safety`);
  return results
    .filter((item) => trusted(item.url))
    .slice(0, 4)
    .map((item) => ({ ...item, source: hostLabel(item.url), kind: "trusted" as const }));
}

async function redditResults(query: string): Promise<RepairResearchItem[]> {
  const results = await searchYahoo(`${query} site:reddit.com/r/ (repair OR MechanicAdvice)`);
  return results
    .filter((item) => {
      try {
        const url = new URL(item.url);
        return (url.hostname === "reddit.com" || url.hostname.endsWith(".reddit.com")) && /\/r\/[^/]+\/comments\//i.test(url.pathname);
      } catch { return false; }
    })
    .slice(0, 3)
    .map((item) => {
      const subreddit = new URL(item.url).pathname.match(/^\/r\/([^/]+)/i)?.[1];
      return { ...item, source: subreddit ? `r/${subreddit}` : "Reddit", kind: "community" as const };
    });
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  const value = body as { issue?: unknown; vehicle?: { year?: unknown; model?: unknown } };
  if (typeof value.issue !== "string" || value.issue.trim().length < 5 || value.issue.length > 500 || typeof value.vehicle?.year !== "number" || typeof value.vehicle.model !== "string") {
    return Response.json({ error: "Describe the issue and vehicle first." }, { status: 400 });
  }
  const guidance = guideRepair(value.issue, { year: value.vehicle.year, model: value.vehicle.model.slice(0, 80) });
  const [trustedLinks, communityLinks] = await Promise.all([trustedResults(guidance.searchTerms), redditResults(guidance.searchTerms)]);
  return Response.json({ guidance, links: [...trustedLinks, ...communityLinks] });
}
