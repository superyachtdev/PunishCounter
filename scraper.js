const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const COOKIES_PATH = "./auth/forum-session.json";
const APPEALS_URL = "https://invadedlands.net/forums/closed-ban-appeals.40/";
const DATA_PATH = "./data/processed-appeals.json";

// 🔐 Discord webhook for appeals
if (!process.env.APPEALS_WEBHOOK_URL) {
  console.error("❌ APPEALS_WEBHOOK_URL not set");
  process.exit(1);
}

const INTERVAL = 60_000;

function loadProcessed() {
  if (!fs.existsSync(DATA_PATH)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(DATA_PATH, "utf8")));
}

function saveProcessed(set) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify([...set], null, 2));
}

async function sendToDiscord(content) {
  await fetch(process.env.APPEALS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
}

async function scrapeOnce() {
  console.log("🔍 Scraper tick");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await context.addCookies(
    JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"))
  );

  const page = await context.newPage();
  await page.goto(APPEALS_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForSelector(".structItem", { timeout: 30000 });

  const processed = loadProcessed();

  const appeals = await page.$$eval(".structItem", items =>
    items.map(item => {
      const link = item.querySelector(".structItem-title a")?.href;
      const status = item.querySelector(".label")?.innerText?.trim().toUpperCase();
      const appealer = item.querySelector(".structItem-parts .username")?.innerText?.trim();
      const staff = item.querySelector(".structItem-cell--latest .username")?.innerText?.trim();
      const time = item.querySelector("time")?.getAttribute("datetime");

      if (!link || !status || !appealer || !staff || !time) return null;
      return { link, status, appealer, staff, time };
    }).filter(Boolean)
  );

  for (const a of appeals) {
    if (processed.has(a.link)) continue;
    if (!["DENIED", "ACCEPTED"].includes(a.status)) continue;

    processed.add(a.link);

    const msg =
      `APPEAL_CLOSED|staff=${a.staff}` +
      `|status=${a.status}` +
      `|appealer=${a.appealer}` +
      `|time=${a.time}`;

    await sendToDiscord(msg);
    console.log("🚨 Sent to Discord:", msg);
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
