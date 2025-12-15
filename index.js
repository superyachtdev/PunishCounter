require("dotenv").config();

// =================================================
// ================== IMPORTS ======================
// =================================================
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const bodyParser = require("body-parser");

// =================================================
// ================= CONFIG ========================
// =================================================
const CHANNEL_ID = "1309957290673180823";
const PORT = process.env.PORT || 3001;

// 🚨 FAIL FAST if token is missing
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is not set");
  process.exit(1);
}

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

client.login(process.env.DISCORD_TOKEN);

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
      const fetched = await channel.messages.fetch({
        limit: 100,
        before: lastId
      });
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
  } catch (err) {
    console.error(err);
    res.status(500).send("Leaderboard error");
  }
});

// =================================================
// ================= STARTUP =======================
// =================================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on ${PORT}`);
});
