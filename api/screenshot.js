import { v2 as cloudinary } from 'cloudinary';

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

  let browser;
  try {
    // Validate env vars
    if (!process.env.TARGET_URL) {
      throw new Error('TARGET_URL environment variable is missing');
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary credentials are missing or incomplete');
    }

    // Dynamic Puppeteer setup for Vercel vs local
    const isVercel = !!process.env.VERCEL_ENV;
    let puppeteer;
    let launchOptions = {
      headless: 'new',
      timeout: 5000, // 5s to launch
    };

    if (isVercel) {
      const chromium = (await import('@sparticuz/chromium')).default;
      puppeteer = (await import('puppeteer-core')).default;
      launchOptions = {
        ...launchOptions,
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        ignoreHTTPSErrors: true,
      };
    } else {
      puppeteer = (await import('puppeteer')).default;
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 }); // Smaller for speed
    const url = process.env.TARGET_URL;

    // Navigate with shorter timeout
    await page.goto(url, {
      waitUntil: 'domcontentloaded', // Faster load
      timeout: 5000,
    });

    // Capture screenshot as buffer (avoids temp files in serverless)
    const screenshotBuffer = await page.screenshot({ fullPage: false });

    // Upload buffer to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: 'screenshots' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(screenshotBuffer);
    });

    await browser.close();

    return res.status(200).json({
      message: 'Screenshot captured and uploaded',
      url: uploadResult.secure_url,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Screenshot error:', error.message, error.stack);
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: 'Failed to capture screenshot', details: error.message });
  }
}