const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// ================= CONFIG =================
const OPEN_APPEALS_RSS =
  "https://invadedlands.net/forums/ban-appeals.19/index.rss";

const CLOSED_APPEALS_RSS =
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

function extractCDATA(xml, tag) {
  const match = xml.match(
    new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]></${tag}>`, "s")
  );
  return match ? match[1].trim() : "";
}

// ================= RSS FETCH =================
async function scrapeFeed(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const xml = await res.text();

  return xml.split("<item>").slice(1).map(item => ({
    title: extractTag(item, "title"),
    link: extractTag(item, "link"),
    time: extractTag(item, "pubDate"),
    author:
      extractTag(item, "dc:creator") ||
      extractTag(item, "author")
  }));
}

// ================= LOOP =================
async function startRSSScraper(send) {
  console.log("🚀 RSS scraper started");

  const openSeen = load(OPEN_DATA);
  const closedSeen = load(CLOSED_DATA);
  const reportSeen = load(REPORTS_DATA);

  while (true) {
    try {
      console.log("🔍 RSS scraper tick");

      // ===== OPEN APPEALS =====
      const open = await scrapeFeed(OPEN_APPEALS_RSS);
      for (const i of open) {
        if (openSeen.has(i.link)) continue;
        openSeen.add(i.link);

        await send({
          type: "appeal_opened",
          appealer: i.title,
          time: i.time
        });
      }

      // ===== CLOSED APPEALS =====
      const closed = await scrapeFeed(CLOSED_APPEALS_RSS);
      for (const i of closed) {
        if (closedSeen.has(i.link)) continue;
        closedSeen.add(i.link);

        await send({
          type: "appeal_closed",
          appealer: i.title,
          status: "CLOSED",
          time: i.time
        });
      }

      // ===== PLAYER REPORTS =====
      // ===== REPORTS =====
const reports = await scrapeFeed(REPORTS_RSS);

console.log(`[RSS] Reports fetched: ${reports.length}`);
console.log(`[RSS] Reports already seen: ${reportSeen.size}`);

for (const item of reports) {
  if (reportSeen.has(item.link)) {
    console.log(`[RSS] Skipping existing report: ${item.link}`);
    continue;
  }

  console.log(`[RSS] NEW report detected: ${item.link}`);

  reportSeen.add(item.link);

  await send({
    type: "report_opened",
    title: item.title,
    link: item.link,
    time: item.pubDate
  });
}


      save(OPEN_DATA, openSeen);
      save(CLOSED_DATA, closedSeen);
      save(REPORTS_DATA, reportSeen);

    } catch (e) {
      console.error("❌ RSS SCRAPER ERROR:", e.message);
    }

    await new Promise(r => setTimeout(r, INTERVAL));
  }
}

module.exports = { startRSSScraper };
