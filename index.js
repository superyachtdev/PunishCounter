require("dotenv").config();

// =================================================
// ================== IMPORTS ======================
// =================================================
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const bodyParser = require("body-parser");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");


// =================================================
// ================= CONFIG ========================
// =================================================
const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN

const CHANNEL_ID = "1309957290673180823";
const PORT = process.env.PORT || 3001;

// Forum URLs
const CLOSED_APPEALS_URL = "https://invadedlands.net/forums/closed-ban-appeals.40/";
const OPEN_APPEALS_URL = "https://invadedlands.net/forums/ban-appeals.19/";

// Scraper storage
const COOKIES_PATH = "./auth/forum-session.json";
const CLOSED_DATA_PATH = "./data/processed-appeals.json";
const OPEN_DATA_PATH = "./data/processed-open-appeals.json";

// Interval
const SCRAPE_INTERVAL_MS = 60_000;

// =================================================
// =============== DISCORD CLIENT ==================
// =================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
});

client.login(DISCORD_BOT_TOKEN);

// =================================================
// =============== EXPRESS SERVER ==================
// =================================================
const app = express();
app.use(bodyParser.json());

// =================================================
// ================= SSE ===========================
// =================================================
let appealListeners = [];

app.get("/appeals/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write("\n");

  appealListeners.push(res);
  console.log("🟢 MC client connected");

  req.on("close", () => {
    appealListeners = appealListeners.filter(r => r !== res);
    console.log("🔴 MC client disconnected");
  });
});

app.post("/appeals/event", (req, res) => {
  const event = req.body;
  console.log("📨 Appeal event received:", event);

  for (const c of appealListeners) {
    c.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  res.sendStatus(200);
});

// =================================================
// ================= LEADERBOARD ===================
// =================================================
app.get("/leaderboard", async (req, res) => {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) return res.status(500).send("Channel not found");

    let messages = [];
    let lastId;

    while (messages.length < 1000) {
      const fetched = await channel.messages.fetch({ limit: 100, before: lastId });
      if (!fetched.size) break;
      messages.push(...fetched.values());
      lastId = fetched.last().id;
    }

    const counts = {};
    for (const msg of messages) {
      if (!msg.content.startsWith("PUNISH|")) continue;

      const staff = msg.content
        .split("|")
        .find(p => p.startsWith("staff="))
        ?.replace("staff=", "");

      if (!staff) continue;
      counts[staff] = (counts[staff] || 0) + 1;
    }

    res.json(
      Object.entries(counts)
        .map(([staff, total]) => ({ staff, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
    );
  } catch (e) {
    console.error(e);
    res.status(500).send("Leaderboard error");
  }
});

// =================================================
// ================= SCRAPER =======================
// =================================================
function loadSet(file) {
  if (!fs.existsSync(file)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(file, "utf8")));
}

function saveSet(file, set) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify([...set], null, 2));
}

// ---------- CLOSED APPEALS ----------
async function scrapeClosedAppeals(context) {
  const page = await context.newPage();

  await page.goto(CLOSED_APPEALS_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForSelector(".structItem", { timeout: 30000 });

  const processed = loadSet(CLOSED_DATA_PATH);

  const appeals = await page.$$eval(".structItem", items =>
    items.map(item => {
      const link = item.querySelector(".structItem-title a")?.href;
      const status = item.querySelector(".label")?.innerText?.trim().toUpperCase();
      const appealer = item.querySelector(".structItem-parts .username")?.innerText?.trim();
      const staff = item.querySelector(".structItem-cell--latest .username")?.innerText?.trim();
      const time = item.querySelector(".structItem-cell--latest time")?.getAttribute("datetime");

      if (!link || !status || !appealer || !staff || !time) return null;
      return { link, status, appealer, staff, time };
    }).filter(Boolean)
  );

  for (const a of appeals) {
    if (processed.has(a.link)) continue;
    if (a.status !== "DENIED" && a.status !== "ACCEPTED") continue;

    processed.add(a.link);

    const event = {
      type: "appeal_closed",
      staff: a.staff,
      status: a.status,
      appealer: a.appealer,
      time: a.time
    };

    console.log("🚨 CLOSED APPEAL:", event);

    for (const c of appealListeners) {
      c.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }

  saveSet(CLOSED_DATA_PATH, processed);
  await page.close();
}

// ---------- OPEN APPEALS ----------
async function scrapeOpenAppeals(context) {
  const page = await context.newPage();

  await page.goto(OPEN_APPEALS_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForSelector(".structItem", { timeout: 30000 });

  const processed = loadSet(OPEN_DATA_PATH);

  const appeals = await page.$$eval(".structItem", items =>
    items.map(item => {
      const link = item.querySelector(".structItem-title a")?.href;
      const appealer = item.querySelector(".structItem-parts .username")?.innerText?.trim();
      const time = item.querySelector("time")?.getAttribute("datetime");

      if (!link || !appealer || !time) return null;
      return { link, appealer, time };
    }).filter(Boolean)
  );

  for (const a of appeals) {
    if (processed.has(a.link)) continue;

    processed.add(a.link);

    const event = {
      type: "appeal_opened",
      appealer: a.appealer,
      time: a.time
    };

    console.log("🆕 NEW APPEAL:", event);

    for (const c of appealListeners) {
      c.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }

  saveSet(OPEN_DATA_PATH, processed);
  await page.close();
}

// ---------- RUN BOTH ----------
async function runScrapers() {
  console.log("🔍 Running appeal scrapers...");

  if (!fs.existsSync(COOKIES_PATH)) {
    console.error("❌ Missing forum-session.json");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
  await context.addCookies(cookies);

  try {
    await scrapeClosedAppeals(context);
    await scrapeOpenAppeals(context);
  } catch (e) {
    console.error("SCRAPER ERROR:", e);
  }

  await browser.close();
}

// =================================================
// ================= STARTUP =======================
// =================================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on ${PORT}`);
  runScrapers();
  setInterval(runScrapers, SCRAPE_INTERVAL_MS);
});
