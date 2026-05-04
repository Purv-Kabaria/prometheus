const fs = require("fs");
const CryptoJS = require("crypto-js");
const { Parser } = require("json2csv");

// --------------------
// 1. Read encrypted text
// --------------------
const encrypted = fs.readFileSync("string.txt", "utf8").trim();

// --------------------
// 2. Decrypt
// --------------------
const password = "AHten@VP0W3R";

const decryptedBytes = CryptoJS.AES.decrypt(encrypted, password);
const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);

if (!decryptedText) {
    throw new Error("Decryption failed");
}

const jsonData = JSON.parse(decryptedText);

// --------------------
// 3. Flatten data
// --------------------
let rows = [];

jsonData.forEach(entry => {
    const year = entry.year;

    entry.data.forEach(item => {
        rows.push({
            year,
            ...item
        });
    });
});

// --------------------
// 4. Convert to CSV
// --------------------
const parser = new Parser();
const csv = parser.parse(rows);

// --------------------
// 5. Save file
// --------------------
fs.writeFileSync("output.csv", csv);

console.log("CSV saved as output.csv");