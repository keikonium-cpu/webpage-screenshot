import puppeteer from 'puppeteer';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs/promises';
import path from 'path';

// Cloudinary config (from env vars)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Launch browser (Vercel-friendly args)
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    const url = process.env.TARGET_URL || 'https://www.ebay.com/sch/i.html?_nkw=ALKALINE+TRIO&_sacat=0&LH_Complete=1'; // Customize via env
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Temp screenshot path
    const tempPath = path.join('/tmp', `screenshot-${Date.now()}.png`);
    await page.screenshot({ path: tempPath, fullPage: true });

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(tempPath, { resource_type: 'image' }, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });

    // Cleanup temp file
    await fs.unlink(tempPath);

    await browser.close();

    res.status(200).json({
      message: 'Screenshot captured and uploaded',
      url: uploadResult.secure_url,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({ error: 'Failed to capture screenshot' });
  }
}