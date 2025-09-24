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
    await page.setViewport({ width: 1280, height: 720 }); // Reasonable size for speed

    // Mimic real browser to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');

    const url = process.env.TARGET_URL;

    // Navigate and wait for network to settle
    await page.goto(url, {
      waitUntil: 'networkidle0', // Wait for all network requests to complete
      timeout: 6000, // 6s max to fit Vercel 10s limit
    });

    // Brief delay to stabilize dynamic content
    await page.waitForTimeout(1000); // 1s for JS rendering

    // Calculate true page height to ensure correct capture
    const pageHeight = await page.evaluate(() => {
      return Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
        document.documentElement.clientHeight
      );
    });
    console.log(`Page height: ${pageHeight}px`);

    // Capture full-page screenshot as buffer
    const screenshotBuffer = await page.screenshot({ 
      fullPage: true, // Captures entire page
      encoding: 'binary',
      type: 'jpeg', // Smaller size
      quality: 80, // Balance size vs quality
    });

    // Upload buffer to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { 
          resource_type: 'image', 
          folder: 'screenshots',
          format: 'jpg',
          quality: 80,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(screenshotBuffer);
    });

    await browser.close();

    return res.status(200).json({
      message: 'Full-page screenshot captured and uploaded',
      url: uploadResult.secure_url,
      timestamp: new Date().toISOString(),
      pageHeight: pageHeight, // Debug info
    });
  } catch (error) {
    console.error('Screenshot error:', error.message, error.stack);
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: 'Failed to capture screenshot', details: error.message });
  }
}