const fetch = require("node-fetch");
const { parseStringPromise } = require("xml2js");
const fs = require("fs");
const path = require("path");

// ================= CONFIG =================
const OPEN_RSS =
  "https://invadedlands.net/forums/ban-appeals.19/index.rss";
const CLOSED_RSS =
  "https://invadedlands.net/forums/closed-ban-appeals.40/index.rss";

const DATA_DIR = "./data";
const OPEN_DATA = `${DATA_DIR}/open.json`;
const CLOSED_DATA = `${DATA_DIR}/closed.json`;

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

async function fetchRSS(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!res.ok) {
    throw new Error(`RSS fetch failed ${res.status}`);
  }

  const xml = await res.text();
  return parseStringPromise(xml);
}

// ================= SCRAPER =================
async function scrapeOnce(send) {
  console.log("🔍 RSS scraper tick");

  const openSeen = load(OPEN_DATA);
  const closedSeen = load(CLOSED_DATA);

  // ===== OPEN APPEALS =====
  const openRSS = await fetchRSS(OPEN_RSS);
  const openItems = openRSS.rss.channel[0].item || [];

  for (const item of openItems) {
    const link = item.link[0];
    if (openSeen.has(link)) continue;

    openSeen.add(link);

    await send({
      type: "appeal_opened",
      appealer: item.title[0],
      time: item.pubDate?.[0] || "unknown"
    });
  }

  // ===== CLOSED APPEALS =====
  const closedRSS = await fetchRSS(CLOSED_RSS);
  const closedItems = closedRSS.rss.channel[0].item || [];

  for (const item of closedItems) {
    const link = item.link[0];
    if (closedSeen.has(link)) continue;

    closedSeen.add(link);

    const title = item.title[0].toUpperCase();
    const status =
      title.includes("DENIED") ? "DENIED" :
      title.includes("ACCEPTED") ? "ACCEPTED" :
      null;

    if (!status) continue;

    await send({
      type: "appeal_closed",
      status,
      appealer: item.title[0],
      time: item.pubDate?.[0] || "unknown"
    });
  }

  save(OPEN_DATA, openSeen);
  save(CLOSED_DATA, closedSeen);
}

// ================= LOOP =================
async function startRSSScraper(send) {
  console.log("🚀 RSS scraper started");

  while (true) {
    try {
      await scrapeOnce(send);
    } catch (e) {
      console.error("❌ RSS SCRAPER ERROR:", e.message);
    }
    await new Promise(r => setTimeout(r, INTERVAL));
  }
}

module.exports = { startRSSScraper };
