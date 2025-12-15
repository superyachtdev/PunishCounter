const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const COOKIES_PATH = "./auth/forum-session.json";
const APPEALS_URL = "https://invadedlands.net/forums/closed-ban-appeals.40/";
const DATA_PATH = "./data/processed-appeals.json";
const SERVER_URL = "http://localhost:3001/appeals/event";

const INTERVAL = 60_000;

function loadProcessed() {
  if (!fs.existsSync(DATA_PATH)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(DATA_PATH, "utf8")));
}

function saveProcessed(set) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify([...set], null, 2));
}

async function scrapeOnce() {
  console.log("🔍 Scraper tick");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8")));

  const page = await context.newPage();
  await page.goto(APPEALS_URL, { waitUntil: "networkidle" });
  await page.waitForSelector(".structItem");

  const processed = loadProcessed();

  const appeals = await page.$$eval(".structItem", items =>
    items.map(item => ({
      link: item.querySelector(".structItem-title a")?.href,
      status: item.querySelector(".label")?.innerText?.trim().toUpperCase(),
      appealer: item.querySelector(".structItem-parts .username")?.innerText?.trim(),
      staff: item.querySelector(".structItem-cell--latest .username")?.innerText?.trim(),
      time: item.querySelector("time")?.getAttribute("datetime")
    })).filter(a => a.link && a.status && a.staff && a.appealer)
  );

  for (const a of appeals) {
    if (processed.has(a.link)) continue;
    if (!["DENIED", "ACCEPTED"].includes(a.status)) continue;

    processed.add(a.link);

    await fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a)
    });

    console.log("🚨 Sent appeal event:", a);
  }

  saveProcessed(processed);
  await browser.close();
}

(async () => {
  while (true) {
    try {
      await scrapeOnce();
    } catch (e) {
      console.error("SCRAPER ERROR:", e);
    }
    await new Promise(r => setTimeout(r, INTERVAL));
  }
})();
