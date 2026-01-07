const express = require("express");
const puppeteer = require("puppeteer");
const { execSync } = require("child_process");

const app = express();
const PORT = process.env.PORT || 5000;

let cache = null;
let loading = true;
let lastError = null;

function getChromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  try {
    return execSync("which chromium").toString().trim();
  } catch {
    return puppeteer.executablePath();
  }
}

async function fetchData() {
  loading = true;
  lastError = null;
  let browser = null;
  
  console.log("Fetching live data...");

  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: getChromiumPath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
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

    await new Promise(resolve => setTimeout(resolve, 6000));

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
  } catch (error) {
    console.error("Error fetching data:", error.message);
    lastError = error.message;
  } finally {
    loading = false;
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error("Error closing browser:", e.message);
      }
    }
  }
}

async function startScheduler() {
  while (true) {
    await fetchData();
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

startScheduler();

app.get("/", (req, res) => {
  res.send("Ambica Live Server OK");
});

app.get("/data", (req, res) => {
  if (loading) {
    return res.json({ status: "loading" });
  }
  if (!cache && lastError) {
    return res.json({ status: "error", error: lastError });
  }
  if (!cache) {
    return res.json({ status: "loading" });
  }
  res.json({ status: "ok", data: cache });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on", PORT);
});
      
