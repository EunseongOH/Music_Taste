const playwright = require('playwright');
const fs = require('fs');
const path = require('path');

const targetDir = 'C:/Users/User/.gemini/antigravity/brain/72eca113-0959-49aa-aef0-ddf4217c8fae';
const screenshotDir = path.join(targetDir, 'screenshots');
const videoDir = path.join(targetDir, 'videos');

// Ensure directories exist
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}
if (!fs.existsSync(videoDir)) {
  fs.mkdirSync(videoDir, { recursive: true });
}

async function run() {
  console.log('Starting Playwright simulation for "Hanroro" Catalog Sort...');
  
  const browser = await playwright.chromium.launch({
    headless: false,
  });
  
  const context = await browser.newContext({
    viewport: { width: 430, height: 850 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: videoDir,
      size: { width: 430, height: 850 }
    }
  });

  const page = await context.newPage();
  
  try {
    // 1. Visit App Home
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotDir, '1_home_page.png') });
    console.log('Home page screenshot captured.');

    // 2. Select "Artist Catalog Sort" mode
    console.log('Selecting "Artist Catalog Sort" mode...');
    const dots = await page.$$('div.flex.justify-center.gap-2.mt-1.mb-4 button');
    if (dots.length >= 2) {
      await dots[1].click({ force: true });
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: path.join(screenshotDir, '2_mode_selected.png') });

    // 3. Click Start
    console.log('Clicking "시작하기"...');
    await page.click('button:has-text("시작하기")', { force: true });
    await page.waitForTimeout(1000);

    // 4. Guest Mode Selection
    console.log('Clicking "가입 없이 게스트로 구경하기"...');
    await page.click('button:has-text("가입 없이 게스트로 구경하기")', { force: true });
    await page.waitForTimeout(1000); // Wait for modal slide transition
    await page.screenshot({ path: path.join(screenshotDir, '3_guest_warning.png') });

    console.log('Clicking "게스트로 계속하기"...');
    await page.click('button:has-text("게스트로 계속하기")', { force: true });
    
    // Wait for redirection
    console.log('Waiting for explore page...');
    await page.waitForURL('**/explore?mode=single');
    await page.waitForTimeout(2500); // Wait for Spotify recommended artists list
    await page.screenshot({ path: path.join(screenshotDir, '4_explore_artists.png') });

    // 5. Search for "한로로"
    console.log('Searching for artist "한로로"...');
    await page.fill('input[placeholder*="아티스트 검색"]', '한로로');
    await page.waitForTimeout(2500); // Wait for debounce and fetch
    await page.screenshot({ path: path.join(screenshotDir, '5_search_result.png') });

    // Click "한로로" in search results
    console.log('Clicking on artist "한로로"...');
    await page.waitForSelector('span:has-text("한로로")');
    await page.click('span:has-text("한로로")', { force: true });
    await page.waitForTimeout(1500); // Wait for pop-in transition of the popup modal
    await page.screenshot({ path: path.join(screenshotDir, '6_artist_confirm_popup.png') });

    // Click "진행하기" on selection popup (framer-motion might render it moving, use force: true)
    console.log('Clicking "진행하기" to confirm "한로로"...');
    await page.click('button:has-text("진행하기")', { force: true });

    // Wait for redirection to tracks page
    console.log('Waiting for tracks selection page...');
    await page.waitForURL('**/tracks?mode=single');
    
    console.log('Waiting for tracks to load and pre-select automatically...');
    await page.waitForSelector('button:has-text("월드컵 대진 생성중")', { timeout: 30000 });
    await page.waitForTimeout(2500); // stable render
    await page.screenshot({ path: path.join(screenshotDir, '7_tracks_loaded.png') });

    // Click "월드컵 대진 생성중"
    console.log('Clicking "월드컵 대진 생성중" FAB...');
    await page.click('button:has-text("월드컵 대진 생성중")', { force: true });

    // Wait for redirection to worldcup page
    console.log('Waiting for worldcup page...');
    await page.waitForURL('**/worldcup?mode=single');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(screenshotDir, '8_worldcup_first_match.png') });

    // 6. Play the World Cup Tournament rounds
    console.log('Starting automated World Cup gameplay loop...');
    let matchCounter = 0;
    while (true) {
      const isFinished = await page.locator('text=My Favorite is...').isVisible();
      if (isFinished) {
        console.log('World Cup Tournament completed! Winner screen shown.');
        await page.screenshot({ path: path.join(screenshotDir, '9_worldcup_winner.png') });
        break;
      }

      const candidates = page.locator('div.flex.flex-row.flex-nowrap.justify-center.items-center > div');
      const count = await candidates.count();
      
      if (count < 3) {
        await page.waitForTimeout(500);
        continue;
      }

      matchCounter++;
      console.log(`Simulating drag-and-drop for match #${matchCounter}...`);

      const candidateIndex = Math.random() > 0.5 ? 0 : 2;
      const targetCandidate = candidates.nth(candidateIndex);
      const box = await targetCandidate.boundingBox();
      
      if (box) {
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.waitForTimeout(400); // wait for 400ms for stable PointerDown LP label revelation
        await page.mouse.move(startX, startY + 170, { steps: 8 });
        await page.mouse.up();
        
        await page.waitForTimeout(2100); // turntable animation duration
      } else {
        await page.waitForTimeout(500);
      }
    }

    // 7. Click "내 음악 취향표 굽기 (FUNC-04)"
    console.log('Clicking "내 음악 취향표 굽기" to bake results...');
    await page.click('button:has-text("내 음악 취향표 굽기")', { force: true });

    // Wait for redirection to taste page
    console.log('Waiting for taste results page...');
    await page.waitForURL('**/taste?mode=single');
    await page.waitForTimeout(4500); // wait for assets and records timeline layout to settle
    await page.screenshot({ path: path.join(screenshotDir, '10_taste_result.png') });
    console.log('Final music taste page screenshot captured.');

    console.log('All steps completed flawlessly!');
  } catch (error) {
    console.error('Error during simulation:', error);
  } finally {
    const videoFile = await page.video().path();
    console.log(`Video recorded successfully at: ${videoFile}`);
    
    const finalVideoPath = path.join(videoDir, 'hanroro_worldcup_flow.webm');
    fs.copyFileSync(videoFile, finalVideoPath);
    console.log(`Final video copied to: ${finalVideoPath}`);

    await context.close();
    await browser.close();
    console.log('Browser closed. Simulation complete.');
  }
}

run();
