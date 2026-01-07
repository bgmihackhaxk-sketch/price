const express = require("express");
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

const app = express();
const PORT = process.env.PORT || 5000;

let cache = null;
let loading = true;
let lastError = null;

async function fetchData() {
  loading = true;
  lastError = null;

  console.log("Fetching live data...");

  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 2
    });

    await page.goto("http://anjujewellery.in/", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    await new Promise(r => setTimeout(r, 6000));

    const data = await page.evaluate(() => {

      function getBox(title) {
        const headers = Array.from(document.querySelectorAll("div"))
          .filter(d => d.innerText && d.innerText.includes(title));

        if (!headers.length) return null;

        const box = headers[0].closest("div");
        if (!box) return null;

        const spans = box.querySelectorAll("span");

        const nums = Array.from(spans)
          .map(s => s.innerText.trim())
          .filter(v => /^[0-9]/.test(v));

        return {
          bid: nums[0] || null,
          ask: nums[1] || null,
          high: nums[2] || null,
          low: nums[3] || null
        };
      }

      return {
        spots: {
          gold: getBox("GOLD SPOT"),
          silver: getBox("SILVER SPOT"),
          inr: getBox("INR SPOT")
        },
        futures: {
          gold: getBox("GOLD FUTURE"),
          silver: getBox("SILVER FUTURE")
        },
        next: {
          gold: getBox("GOLD NEXT"),
          silver: getBox("SILVER NEXT")
        },
        tables: Array.from(document.querySelectorAll("table"))
          .map(t => t.outerHTML)
      };
    });

    cache = data;
    console.log("Data updated");

  } catch (e) {
    console.error("❌ Error:", e.message);
    lastError = e.message;
  }

  loading = false;

  if (browser) await browser.close();
}

async function startScheduler() {
  while (true) {
    await fetchData();
    await new Promise(r => setTimeout(r, 10000));
  }
}

startScheduler();

app.get("/", (req, res) => {
  res.send("Ambica Live Server OK");
});

app.get("/data", (req, res) => {
  if (loading) return res.json({ status: "loading" });

  if (!cache && lastError)
    return res.json({ status: "error", error: lastError });

  if (!cache) return res.json({ status: "loading" });

  res.json({ status: "ok", data: cache });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on", PORT);
});