import https from "https";
const url = "https://www.officialcharts.com/charts/singles-chart/19830724/7501/";
const options = { headers: { "User-Agent": "Mozilla/5.0" } };
https.get(url, options, (res) => {
  let data = "";
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => {
    const match = data.match(/"chartItems":\[\d+,\{"element":\d+,"nid":\d+,"title":"([^"]+)","url":"[^"]*","artist":"([^"]+)"/);
    if (match) console.log("UK #1:", match[1], "-", match[2]);
    else console.log("No match. Status:", res.statusCode, "Length:", data.length);
  });
}).on("error", (e) => console.log("Error:", e.message));
