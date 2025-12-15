const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// ================= CONFIG =================
const COOKIES_PATH = "./auth/forum-session.json";

const OPEN_URL =
  "https://invadedlands.net/forums/ban-appeals.19/";
const CLOSED_URL =
  "https://invadedlands.net/forums/closed-ban-appeals.40/";

const DATA_DIR = "./data";
const OPEN_DATA = path.join(DATA_DIR, "open.json");
const CLOSED_DATA = path.join(DATA_DIR, "closed.json");

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

async function waitForCloudflare(page) {
  await page.waitForFunction(
    () => !document.title.includes("Just a moment"),
    { timeout: 60_000 }
  );
}

// ================= SCRAPER =================
async function scrapeOnce(send) {
  console.log("🔍 Scraper tick");

  const browser = await chromium.launch({
    headless: false, // ❗ REQUIRED
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1280, height: 800 }
  });

  // Load cookies
  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
  await context.addCookies(cookies);

  const page = await context.newPage();

  const openSeen = load(OPEN_DATA);
  const closedSeen = load(CLOSED_DATA);

  // ================= OPEN APPEALS =================
  await page.goto(OPEN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  console.log("🧭 Page title (open):", await page.title());
  await waitForCloudflare(page);

  await page.waitForSelector(".structItem", { timeout: 60_000 });

  const openAppeals = await page.$$eval(".structItem", items =>
    items.map(i => ({
      link: i.querySelector("a")?.href,
      appealer: i.querySelector(".username")?.innerText?.trim(),
      time: i.querySelector("time")?.getAttribute("datetime")
    })).filter(a => a.link && a.appealer)
  );

  for (const a of openAppeals) {
    if (openSeen.has(a.link)) continue;
    openSeen.add(a.link);

    console.log("🆕 OPEN APPEAL:", a.appealer);

    await send({
      type: "appeal_opened",
      appealer: a.appealer,
      time: a.time
    });
  }

  // ================= CLOSED APPEALS =================
  await page.goto(CLOSED_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  console.log("🧭 Page title (closed):", await page.title());
  await waitForCloudflare(page);

  await page.waitForSelector(".structItem", { timeout: 60_000 });

  const closedAppeals = await page.$$eval(".structItem", items =>
    items.map(i => ({
      link: i.querySelector("a")?.href,
      status: i.querySelector(".label")?.innerText?.trim()?.toUpperCase(),
      appealer: i.querySelector(".structItem-parts .username")?.innerText?.trim(),
      staff: i.querySelector(".structItem-cell--latest .username")?.innerText?.trim(),
      time: i.querySelector("time")?.getAttribute("datetime")
    })).filter(a => a.link && a.status && a.staff)
  );

  for (const a of closedAppeals) {
    if (closedSeen.has(a.link)) continue;
    if (!["DENIED", "ACCEPTED"].includes(a.status)) continue;

    closedSeen.add(a.link);

    console.log("🚨 CLOSED APPEAL:", a.appealer, a.status);

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

// ================= LOOP =================
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
