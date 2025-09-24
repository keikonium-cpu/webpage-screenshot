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
    const viewport = { width: 1280, height: 720 };
    await page.setViewport(viewport);

    // Mimic real browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');

    const url = process.env.TARGET_URL;

    // Navigate with adjusted timeout
    await page.goto(url, {
      waitUntil: 'load', // Faster for initial content
      timeout: 10000, // 10s to handle eBay's load
    });

    // Scroll to load lazy images (up to 5 viewports = 3600px)
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 200;
        const maxHeight = 3600; // 5 * 720px
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= maxHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    // Delay for stabilization (using setTimeout)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Calculate page height for logging (not used for capture)
    const pageHeight = await page.evaluate(() => Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.documentElement.clientHeight
    ));
    console.log(`Calculated page height: ${pageHeight}px`);

    // Reset scroll to top
    await page.evaluate(() => window.scrollTo(0, 0));

    // Capture 5 viewport heights (1280x3600)
    const screenshotBuffer = await page.screenshot({
      clip: { x: 0, y: 0, width: 1280, height: 3600 },
      type: 'jpeg',
      quality: 80,
    });

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: 'screenshots', format: 'jpg', quality: 80 },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(screenshotBuffer);
    });

    await browser.close();

    return res.status(200).json({
      message: 'Screenshot captured and uploaded (5 viewport heights)',
      url: uploadResult.secure_url,
      timestamp: new Date().toISOString(),
      pageHeight: pageHeight,
    });
  } catch (error) {
    console.error('Screenshot error:', error.message, error.stack);
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: 'Failed to capture screenshot', details: error.message });
  }
}