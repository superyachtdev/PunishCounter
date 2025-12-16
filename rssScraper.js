const fs = require("fs");
const path = require("path");

// ================= CONFIG =================
const REPORTS_RSS =
  "https://invadedlands.net/forums/player-reports.18/index.rss";

const DATA_DIR = "./data";
const INTERVAL = 60_000;

const BRIGHTDATA_API = "https://api.brightdata.com/request";
const BRIGHTDATA_KEY = process.env.BRIGHTDATA_API_KEY;
const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE;

// ================= SAFETY CHECK =================
if (!BRIGHTDATA_KEY || !BRIGHTDATA_ZONE) {
  throw new Error("❌ Bright Data credentials not set");
}

// ================= RSS FETCH =================
async function fetchViaBrightData(url) {
  const res = await fetch(BRIGHTDATA_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIGHTDATA_KEY}`
    },
    body: JSON.stringify({
      zone: BRIGHTDATA_ZONE,
      url,
      format: "raw"
    })
  });

  const text = await res.text();
  return text;
}

// ================= RSS PARSER =================
function extract(tag, block) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
}

function parseRSS(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const block = m[1];
    return {
      title: extract("title", block),
      link: extract("link", block),
      time: extract("pubDate", block)
    };
  });
}

// ================= LOOP =================
async function startRSSScraper(send) {
  console.log("🚀 RSS scraper started (BRIGHT DATA)");

  while (true) {
    try {
      console.log("🔍 RSS scraper tick");

      const xml = await fetchViaBrightData(REPORTS_RSS);

      if (!xml.includes("<rss")) {
        console.error("❌ Not RSS XML (Cloudflare HTML received)");
        console.log(xml.slice(0, 300));
      }

      const items = parseRSS(xml);
      console.log(`📄 RSS items parsed: ${items.length}`);

      for (const item of items) {
        await send({
          type: "report_opened",
          title: item.title,
          link: item.link,
          time: item.time
        });
      }
    } catch (e) {
      console.error("❌ RSS SCRAPER ERROR:", e.message);
    }

    console.log("⏳ Sleeping 60s");
    await new Promise(r => setTimeout(r, INTERVAL));
  }
}

module.exports = { startRSSScraper };
