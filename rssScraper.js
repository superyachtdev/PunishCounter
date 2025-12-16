const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// ================= CONFIG =================
const OPEN_RSS =
  "https://invadedlands.net/forums/ban-appeals.19/index.rss";
const CLOSED_RSS =
  "https://invadedlands.net/forums/closed-ban-appeals.40/index.rss";
const REPORTS_RSS =
  "https://invadedlands.net/forums/player-reports.18/index.rss";

const DATA_DIR = "./data";
const OPEN_DATA = path.join(DATA_DIR, "open.json");
const CLOSED_DATA = path.join(DATA_DIR, "closed.json");
const REPORTS_DATA = path.join(DATA_DIR, "reports.json");

const INTERVAL = 60_000;

// ================= HELPERS =================
function load(file) {
  if (!fs.existsSync(file)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(file, "utf8")));
}

function save(file, set) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify([...set], null, 2));
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
  return match ? match[1].trim() : "";
}

async function scrapeFeed(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const xml = await res.text();

  return xml.split("<item>").slice(1).map(i => ({
    title: extractTag(i, "title"),
    link: extractTag(i, "link"),
    pubDate: extractTag(i, "pubDate")
  }));
}

// ================= LOOP =================
async function startRSSScraper(send) {
  console.log("🚀 RSS scraper started");

  const openSeen = load(OPEN_DATA);
  const closedSeen = load(CLOSED_DATA);
  const reportsSeen = load(REPORTS_DATA);

  while (true) {
    try {
      console.log("🔍 RSS scraper tick");

      for (const item of await scrapeFeed(OPEN_RSS)) {
        if (openSeen.has(item.link)) continue;
        openSeen.add(item.link);

        await send({
          type: "appeal_opened",
          appealer: item.title,
          time: item.pubDate
        });
      }

      for (const item of await scrapeFeed(CLOSED_RSS)) {
        if (closedSeen.has(item.link)) continue;
        closedSeen.add(item.link);

        await send({
          type: "appeal_closed",
          status: "CLOSED",
          appealer: item.title,
          time: item.pubDate
        });
      }

      for (const item of await scrapeFeed(REPORTS_RSS)) {
        if (reportsSeen.has(item.link)) continue;
        reportsSeen.add(item.link);

        await send({
          type: "report_opened",
          title: item.title,
          link: item.link,
          time: item.pubDate
        });
      }

      save(OPEN_DATA, openSeen);
      save(CLOSED_DATA, closedSeen);
      save(REPORTS_DATA, reportsSeen);
    } catch (e) {
      console.error("❌ RSS SCRAPER ERROR:", e.message);
    }

    await new Promise(r => setTimeout(r, INTERVAL));
  }
}

module.exports = { startRSSScraper };
