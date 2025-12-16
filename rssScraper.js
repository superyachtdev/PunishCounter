// rssScraper.js

// Node 18+ has global fetch
const fetch = global.fetch;

// ================= CONFIG =================
const REPORTS_RSS =
  "https://invadedlands.net/forums/player-reports.18/index.rss";

const INTERVAL = 60_000;

// ================= HELPERS =================
function extract(tag, block) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
}

// ================= RSS PARSER =================
async function fetchReports() {
  const res = await fetch(REPORTS_RSS, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const xml = await res.text();

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const block = m[1];
    return {
      title: extract("title", block),
      link: extract("link", block),
      time: extract("pubDate", block)
    };
  });

  return items;
}

// ================= LOOP =================
async function startRSSScraper(send) {
  console.log("🚀 RSS scraper started (SEND-ALL MODE)");

  while (true) {
    try {
      console.log("🔍 RSS scraper tick");

      const reports = await fetchReports();
      console.log(`📄 RSS items fetched: ${reports.length}`);

      for (const r of reports) {
        if (!r.link) continue;

        console.log("📤 Sending report:", r.link);

        await send({
          type: "report_opened",
          title: r.title,
          link: r.link,
          time: r.time
        });
      }
    } catch (e) {
      console.error("❌ RSS SCRAPER ERROR:", e);
    }

    console.log("⏳ Sleeping 60s\n");
    await new Promise(r => setTimeout(r, INTERVAL));
  }
}

module.exports = { startRSSScraper };
