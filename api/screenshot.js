import puppeteer from 'puppeteer';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs/promises';
import path from 'path';

// Ensure Cloudinary config
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
    // Validate env vars
    if (!process.env.TARGET_URL) {
      throw new Error('TARGET_URL environment variable is missing');
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary credentials are missing or incomplete');
    }

    // Launch browser with Vercel-optimized args
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process', // Reduce memory for Vercel
      ],
      timeout: 5000, // 5s to launch browser
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 }); // Smaller for speed
      const url = process.env.TARGET_URL;

      // Navigate with shorter timeout
      await page.goto(url, {
        waitUntil: 'domcontentloaded', // Faster than networkidle2
        timeout: 5000, // 5s max
      });

      // Generate temp file path
      const tempPath = path.join('/tmp', `screenshot-${Date.now()}.png`);
      await page.screenshot({ path: tempPath, fullPage: false }); // Partial page for speed

      // Upload to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload(
          tempPath,
          { resource_type: 'image', folder: 'screenshots' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
      });

      // Clean up temp file
      await fs.unlink(tempPath).catch(err => console.warn('Temp file cleanup failed:', err));

      await browser.close();

      return res.status(200).json({
        message: 'Screenshot captured and uploaded',
        url: uploadResult.secure_url,
        timestamp: new Date().toISOString(),
      });
    } catch (innerError) {
      await browser.close();
      throw innerError; // Ensure browser closes on error
    }
  } catch (error) {
    console.error('Screenshot error:', error.message, error.stack);
    return res.status(500).json({ error: 'Failed to capture screenshot', details: error.message });
  }
}