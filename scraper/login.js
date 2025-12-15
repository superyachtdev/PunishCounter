const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({
    headless: false,                 // 🔴 REQUIRED
    slowMo: 50,                      // looks human
    args: [
      "--disable-blink-features=AutomationControlled"
    ]
  });

  const context = await browser.newContext({
    viewport: null,                  // real window size
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/121.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();

  console.log("🌐 Opened browser. Please log in manually.");
  await page.goto("https://invadedlands.net/login", {
    waitUntil: "networkidle"
  });

  // Wait until you're logged in (staff bar appears)
  await page.waitForSelector(".p-navgroup--member", {
    timeout: 0
  });

  // Save cookies
  const cookies = await context.cookies();
  fs.writeFileSync("auth/forum-session.json", JSON.stringify(cookies, null, 2));

  console.log("✅ Login detected, session saved.");
})();
