const fs = require("fs");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const { Parser } = require("json2csv");

const YEARS = [2022, 2023, 2024, 2025]

const PASSWORD = "AHten@VP0W3R";

const STATES = [
    "Andhra%20Pradesh",
    "Arunachal%20Pradesh",
    "Assam",
    "Bihar",
    "Chandigarh",
    "Chhattisgarh",
    "DVC",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu and Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Puducherry",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil%20Nadu",
    "Telangana",
    "Tripura",
    "Uttar%20Pradesh",
    "Uttarakhand",
    "West%20Bengal",
].sort((a, b) => a.localeCompare(b));

// const YEAR = 2022;

// ---------------- decrypt ----------------
function decryptData(encrypted) {
    const bytes = CryptoJS.AES.decrypt(encrypted, PASSWORD);
    const text = bytes.toString(CryptoJS.enc.Utf8);

    if (!text) throw new Error("Decryption failed");

    return JSON.parse(text);
}

// ---------------- parse d field ----------------
function parseD(d, year) {  // <-- accept year
    const [datePart, timePart] = d.split(" ");
    const [day, mon] = datePart.split("-");

    const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
    const monthNum = String(months[mon]).padStart(2, "0");
    const dayPad = day.padStart(2, "0");
    const date = `${dayPad}/${monthNum}/${String(year).slice(-2)}`;  // <-- use year param

    let hour;
    if (timePart === "12am") hour = 0;
    else if (timePart === "12pm") hour = 12;
    else if (timePart.endsWith("am")) hour = parseInt(timePart);
    else hour = parseInt(timePart) + 12;

    return { date, hour };
}

// ---------------- flatten ----------------
function flatten(jsonData, stateName, year) {  // <-- accept year
    let rows = [];

    jsonData.forEach(entry => {
        if (!entry.data) return;

        entry.data.forEach(item => {
            const { date, hour } = parseD(item.d, year);  // <-- pass year
            rows.push({
                State: stateName,
                Date: date,
                Hour: hour,
                "Hourly Demand Met (in MW)": item.v
            });
        });
    });

    return rows;
}

// ---------------- main ----------------
async function run() {
    fs.mkdirSync("statewise", { recursive: true });  // <-- create dir

    for (const YEAR of YEARS) {  // <-- outer year loop
        const allRows = [];

        for (const stateEncoded of STATES) {
            const stateName = decodeURIComponent(stateEncoded);
            const url = `https://icedapi.niti.gov.in/energy/electricity/distribution/loadCurveYearly?year=${YEAR}&state=${stateEncoded}`;

            try {
                console.log(`[${YEAR}] Calling API for ${stateName}...`);

                const response = await axios.get(url);
                const encrypted = response.data;
                const jsonData = decryptData(encrypted);
                const rows = flatten(jsonData, stateName, YEAR);

                allRows.push(...rows);

                console.log(`[${YEAR}] Fetched ${stateName} (${rows.length} rows)`);

            } catch (err) {
                console.error(`[${YEAR}] Error for ${stateName}:`, err.message);
            }
        }

        const parser = new Parser({ quote: "" });
        const csv = parser.parse(allRows);
        fs.writeFileSync(`statewise/y${YEAR}.csv`, csv);  // <-- dynamic path
        console.log(`Saved statewise/y${YEAR}.csv (${allRows.length} rows)`);
    }
}

run()