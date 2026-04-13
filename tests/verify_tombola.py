import asyncio
from playwright.async_api import async_playwright

async def verify_tombola():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        # Bypass auth guard
        await page.goto("http://localhost:8080/pdm-staff.html")
        await page.evaluate("localStorage.setItem('pdm_logged_in', 'true')")

        # Go to tombola page
        await page.goto("http://localhost:8080/tombola.html")

        # Check title
        title = await page.inner_text("h1")
        print(f"Page title: {title}")

        # Check if basic elements are present
        draw_btn = page.locator("#drawBtn")
        is_visible = await draw_btn.is_visible()
        print(f"Draw button visible: {is_visible}")

        # Verify sidebar has Tombola link
        tombola_link = page.locator("nav.sidebar-nav a[href='tombola.html']")
        count = await tombola_link.count()
        print(f"Tombola link in sidebar count: {count}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_tombola())
