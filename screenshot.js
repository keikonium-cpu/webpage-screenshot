const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function captureScreenshot() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const url = 'https://www.ebay.com/sch/i.html?_nkw=alkaline+trio&LH_Complete=1'; // Replace with your target webpage
  const outputDir = './screenshots'; // Directory to save screenshots

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Set viewport size (optional, adjust as needed)
  await page.setViewport({ width: 1920, height: 1080 });

  // Navigate to the webpage
  await page.goto(url, { waitUntil: 'networkidle2' });

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(outputDir, `screenshot-${timestamp}.png`);

  // Capture screenshot
  await page.screenshot({ path: filePath, fullPage: true });

  console.log(`Screenshot saved to ${filePath}`);

  // Close browser
  await browser.close();
}

captureScreenshot().catch(err => {
  console.error('Error capturing screenshot:', err);
  process.exit(1);
});