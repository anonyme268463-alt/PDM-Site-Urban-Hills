import asyncio
from playwright.async_api import async_playwright

async def verify_logic():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        # Test Redirection
        await page.goto("http://localhost:8080/index.html")
        await page.evaluate("localStorage.clear()")

        # Attempt to access dashboard
        print("Accessing dashboard.html...")
        await page.goto("http://localhost:8080/dashboard.html")
        await page.wait_for_selector("h1:has-text('Accès Staff')")
        print("Unauthenticated redirect to login verified.")

        # Verify common.js fast-track redirect
        print("Accessing ventes.html...")
        await page.goto("http://localhost:8080/ventes.html")
        await page.wait_for_selector("h1:has-text('Accès Staff')")
        print("Fast-track redirect in common.js verified.")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_logic())
