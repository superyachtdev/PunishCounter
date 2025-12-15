const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const COOKIES_PATH = "./auth/forum-session.json";
const CLOSED_URL = "https://invadedlands.net/forums/closed-ban-appeals.40/";
const OPEN_URL = "https://invadedlands.net/forums/ban-appeals.19/";

const DATA_DIR = "./data";
const CLOSED_DATA = `${DATA_DIR}/closed.json`;
const OPEN_DATA = `${DATA_DIR}/open.json`;

const INTERVAL = 60_000;

function load(file) {
  if (!fs.existsSync(file)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(file, "utf8")));
}

function save(file, set) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify([...set], null, 2));
}

async function scrapeOnce(send) {
  console.log("🔍 Scraper tick");

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  await ctx.addCookies(JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8")));

  const openSeen = load(OPEN_DATA);
  const closedSeen = load(CLOSED_DATA);

  const page = await ctx.newPage();

  // ---------- OPEN ----------
  await page.goto(OPEN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".structItem");

  const open = await page.$$eval(".structItem", items =>
    items.map(i => ({
      link: i.querySelector("a")?.href,
      appealer: i.querySelector(".username")?.innerText,
      time: i.querySelector("time")?.getAttribute("datetime")
    })).filter(a => a.link && a.appealer)
  );

  for (const a of open) {
    if (openSeen.has(a.link)) continue;
    openSeen.add(a.link);

    await send({
      type: "appeal_opened",
      appealer: a.appealer,
      time: a.time
    });
  }

  // ---------- CLOSED ----------
  await page.goto(CLOSED_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".structItem");

  const closed = await page.$$eval(".structItem", items =>
    items.map(i => ({
      link: i.querySelector("a")?.href,
      status: i.querySelector(".label")?.innerText?.toUpperCase(),
      appealer: i.querySelector(".structItem-parts .username")?.innerText,
      staff: i.querySelector(".structItem-cell--latest .username")?.innerText,
      time: i.querySelector("time")?.getAttribute("datetime")
    })).filter(a => a.link && a.status && a.staff)
  );

  for (const a of closed) {
    if (closedSeen.has(a.link)) continue;
    if (!["DENIED", "ACCEPTED"].includes(a.status)) continue;

    closedSeen.add(a.link);

    await send({
      type: "appeal_closed",
      staff: a.staff,
      status: a.status,
      appealer: a.appealer,
      time: a.time
    });
  }

  save(OPEN_DATA, openSeen);
  save(CLOSED_DATA, closedSeen);

  await browser.close();
}

async function startScraper(send) {
  while (true) {
    try {
      await scrapeOnce(send);
    } catch (e) {
      console.error("SCRAPER ERROR:", e);
    }
    await new Promise(r => setTimeout(r, INTERVAL));
  }
}

module.exports = { startScraper };
