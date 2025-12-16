const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled"
    ]
  });

  // 🔑 PERSISTENT CONTEXT (VERY IMPORTANT)
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  console.log("👉 Opening appeals page");
  await page.goto(
    "https://invadedlands.net/forums/ban-appeals.19/",
    { waitUntil: "domcontentloaded" }
  );

  console.log("🧠 Solve Cloudflare manually");
  console.log("⏳ WAIT until you see actual appeals (threads)");
  console.log("❗ DO NOT reload or navigate");

  // 🔥 THIS IS THE KEY LINE
  await page.waitForSelector(".structItem", {
    timeout: 0
  });

  console.log("✅ Forum content detected, saving cookies");

  const cookies = await context.cookies();
  fs.writeFileSync(
    "./auth/forum-session.json",
    JSON.stringify(cookies, null, 2)
  );

  console.log("💾 Cookies saved successfully");
  console.log("🚀 You can close the browser now");

})();
