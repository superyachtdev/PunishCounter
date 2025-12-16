const { HttpsProxyAgent } = require("https-proxy-agent");

// Node 18+ global fetch
const fetch = global.fetch;

// ================= CONFIG =================
const REPORTS_RSS =
  "https://invadedlands.net/forums/player-reports.18/index.rss";

const INTERVAL = 60_000;

// 🔴 BRIGHT DATA PROXY (EXACT)
const PROXY_URL =
  "http://brd-customer-hl_d0683e82-zone-punishcounter:n49pu21tmjy3@brd.superproxy.io:33335";

// ================= FETCH =================
async function fetchRSS() {
  const agent = new HttpsProxyAgent(PROXY_URL);

  const res = await fetch(REPORTS_RSS, {
    agent,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept":
        "application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });

  const text = await res.text();

  console.log("🧪 RSS HTTP status:", res.status);
  console.log("🧪 RSS preview:\n", text.slice(0, 500));

  return text;
}

// ================= PARSER =================
function parseItems(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

  return items.map(m => {
    const block = m[1];
    const extract = tag =>
      (block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1]?.trim();

    return {
      title: extract("title"),
      link: extract("link"),
      time: extract("pubDate")
    };
  });
}

// ================= LOOP =================
async function startRSSScraper(send) {
  console.log("🚀 RSS scraper started (BRIGHT DATA)");

  while (true) {
    try {
      console.log("🔍 RSS scraper tick");

      const xml = await fetchRSS();
      const items = parseItems(xml);

      console.log(`📄 RSS items parsed: ${items.length}`);

      for (const item of items) {
        console.log("📨 Sending:", item.link);

        await send({
          type: "report_opened",
          title: item.title,
          link: item.link,
          time: item.time
        });
      }
    } catch (err) {
      console.error("❌ RSS SCRAPER ERROR:", err.message);
    }

    console.log("⏳ Sleeping 60s");
    await new Promise(r => setTimeout(r, INTERVAL));
  }
}

module.exports = { startRSSScraper };
