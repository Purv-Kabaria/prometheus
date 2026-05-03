const fs = require("fs");
const path = require("path");

const dir = "statewise";

fs.readdirSync(dir).forEach(file => {
    if (!file.endsWith(".csv")) return;

    const filepath = path.join(dir, file);
    const content = fs.readFileSync(filepath, "utf8");
    const cleaned = content
        .replace(/"/g, "")  // remove quotes
        .replace(/(\d+\.\d{2})\d+/g, "$1");  // trim to 2 decimal places

    fs.writeFileSync(filepath, cleaned);
    console.log(`Cleaned ${file}`);
});