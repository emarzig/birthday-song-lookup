import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(process.cwd());
const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT_DIR, "public")));

const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];


function httpGet(url: string, maxRedirects = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) { reject(new Error("Too many redirects")); return; }
    const headers: Record<string, string> = { "User-Agent": "BirthdaySongLookup/1.0 (https://github.com/emarzig/birthday-song-lookup)" };
    if (url.includes("wikipedia.org") || url.includes("wikimedia.org")) {
      headers["Api-User-Agent"] = "BirthdaySongLookup/1.0 (https://github.com/emarzig/birthday-song-lookup)";
    }
    https.get(url, { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (!loc) { reject(new Error("Redirect without location")); return; }
        const next = loc.startsWith("http") ? loc : "https://www.officialcharts.com" + loc;
        httpGet(next, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error("HTTP " + res.statusCode)); return; }
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function getNearbySaturdays(date: string): string[] {
  const d = new Date(date + "T00:00:00Z");
  const dow = d.getUTCDay();
  const dates: string[] = [];
  const prevSat = new Date(d);
  prevSat.setUTCDate(prevSat.getUTCDate() - ((dow + 1) % 7));
  for (let i = 0; i < 4; i++) {
    const ps = new Date(prevSat);
    ps.setUTCDate(ps.getUTCDate() - (i * 7));
    dates.push(ps.toISOString().substring(0, 10));
  }
  return dates;
}

async function getUSAChart(date: string) {
  if (date < "1958-08-04") {
    return { available: false, message: "Chart not available before August 4, 1958" };
  }
  const saturdays = getNearbySaturdays(date);
  for (const sat of saturdays) {
    try {
      const url = "https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/date/" + sat + ".json";
      const text = await httpGet(url);
      const json = JSON.parse(text);
      const no1 = json.data.find((e: any) => e.this_week === 1);
      if (no1) return { available: true, songTitle: no1.song, artist: no1.artist };
    } catch { continue; }
  }
  return { available: false, message: "Chart data not available for this date" };
}

async function getUKChart(date: string) {
  try {
    if (date < "1952-11-14") return { available: false, message: "UK chart did not exist before November 1952" };

    const d = date.replace(/-/g, "");
    const url = "https://www.officialcharts.com/charts/singles-chart/" + d + "/7501/";
    const text = await httpGet(url);
    const m = text.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return { available: false, message: "UK chart data not available for this date" };
    const data = JSON.parse(m[1]);
    for (let i = 0; i < data.length; i++) {
      if (typeof data[i] === "object" && data[i] !== null && "nid" in data[i] && "title" in data[i] && "artist" in data[i] && "position" in data[i]) {
        const posIdx = data[i].position;
        if (data[posIdx] === 1) {
          const titleIdx = data[i].title;
          const artistIdx = data[i].artist;
          return { available: true, songTitle: data[titleIdx], artist: data[artistIdx] };
        }
      }
    }
    return { available: false, message: "UK chart data not available for this date" };
  } catch (err: any) {
    console.log("UK error:", err.message);
    return { available: false, message: "Could not connect to UK chart service" };
  }
}

async function fetchWikipediaEvents(month: string, day: string): Promise<any[]> {
  const urls = [
    `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`,
    `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`
  ];
  for (const url of urls) {
    try {
      const text = await httpGet(url);
      const json = JSON.parse(text);
      return json.events || [];
    } catch { continue; }
  }
  return [];
}

async function getWorldEventsOnDate(date: string) {
  try {
    const d = new Date(date + "T00:00:00Z");
    const year = d.getUTCFullYear();

    // Try exact date first, then nearby days (±1, ±2, ±3)
    const daysToTry: Date[] = [d];
    for (let offset = 1; offset <= 3; offset++) {
      const before = new Date(d);
      before.setUTCDate(before.getUTCDate() - offset);
      const after = new Date(d);
      after.setUTCDate(after.getUTCDate() + offset);
      daysToTry.push(before, after);
    }

    for (const tryDate of daysToTry) {
      const month = String(tryDate.getUTCMonth() + 1).padStart(2, "0");
      const day = String(tryDate.getUTCDate()).padStart(2, "0");
      const events = await fetchWikipediaEvents(month, day);
      // Filter only events from the exact birth year
      const exactYearEvents = events
        .filter((e: any) => e.year === year)
        .slice(0, 3);
      if (exactYearEvents.length > 0) {
        const dateLabel = tryDate.toISOString().substring(0, 10);
        return {
          available: true,
          dateUsed: dateLabel,
          events: exactYearEvents.map((e: any) => ({
            year: String(e.year),
            description: e.text
          }))
        };
      }
    }
    return { available: false, message: "No historical events found on or near this date" };
  } catch (err: any) {
    console.log("World events on date error:", err.message);
    return { available: false, message: "Could not fetch historical events" };
  }
}

async function getWorldEventsThisDay(date: string) {
  try {
    const d = new Date(date + "T00:00:00Z");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const events = await fetchWikipediaEvents(month, day);
    const allEvents = events.sort((a: any, b: any) => b.year - a.year);
    const picked: any[] = [];
    if (allEvents.length <= 3) {
      picked.push(...allEvents);
    } else {
      // Pick from recent, middle, and old history for variety
      picked.push(allEvents[0]);
      picked.push(allEvents[Math.floor(allEvents.length / 2)]);
      picked.push(allEvents[allEvents.length - 1]);
    }
    if (picked.length === 0) {
      return { available: false, message: "No historical events found for this day" };
    }
    return {
      available: true,
      events: picked.map((e: any) => ({
        year: String(e.year),
        description: e.text
      }))
    };
  } catch (err: any) {
    console.log("World events this day error:", err.message);
    return { available: false, message: "Could not fetch historical events" };
  }
}

function getRegionalChart(date: string) {
  const localData: any = {
    yugoslavia: [
      {start:"1969-07-19",end:"1969-07-25",song:"Samo ti",artist:"Indexi"},
      {start:"1985-07-13",end:"1985-07-19",song:"Hajde da se volimo",artist:"Lepa Brena"},
      {start:"1990-06-01",end:"1990-06-07",song:"Jutro",artist:"Bijelo Dugme"}
    ],
    croatia: [
      {start:"2000-01-01",end:"2000-01-07",song:"Virujem u te",artist:"Gibonni"},
      {start:"2010-06-05",end:"2010-06-11",song:"Lijepa zeno",artist:"Petar Graso"},
      {start:"2020-03-21",end:"2020-03-27",song:"Srce za dvoje",artist:"Nina Badric"}
    ]
  };
  const isYu = date < "1991-01-01";
  const chartSource = isYu ? "Yugoslavia" : "Croatia";
  const list = isYu ? localData.yugoslavia : localData.croatia;
  for (const entry of list) {
    if (date >= entry.start && date <= entry.end) {
      return { available: true, songTitle: entry.song, artist: entry.artist, chartSource };
    }
  }
  return { available: false, message: chartSource + " chart data not available for this date" };
}

app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "index.html"));
});

app.post("/api/lookup", async (req, res) => {
  const { date } = req.body;
  if (!date || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
    return res.status(400).json({ error: true, message: "Date must be in YYYY-MM-DD format" });
  }
  const d = new Date(date + "T00:00:00Z");
  const dayOfWeek = days[d.getUTCDay()];
  const [usaChart, ukChart, worldEventsOnDate, worldEventsThisDay] = await Promise.all([
    getUSAChart(date), getUKChart(date), getWorldEventsOnDate(date), getWorldEventsThisDay(date)
  ]);
  const regionalChart = getRegionalChart(date);
  res.json({ inputDate: date, dayOfWeek, usaChart, ukChart, regionalChart, worldEventsOnDate, worldEventsThisDay });
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running at http://localhost:3000");
  console.log("Serving static files from:", path.join(ROOT_DIR, "public"));
});
