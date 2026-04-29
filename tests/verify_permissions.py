import asyncio
from playwright.async_api import async_playwright

async def verify_permissions():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Bypass direct redirect for testing
        await page.goto("http://localhost:8080/pdm-staff.html")
        await page.evaluate("localStorage.setItem('pdm_logged_in', 'true')")

        page.on("console", lambda msg: print(f"CONSOLE {msg.type}: {msg.text}"))

        print("--- Testing Dashboard ---")
        await page.goto("http://localhost:8080/dashboard.html")
        await asyncio.sleep(3)

        print("--- Testing Clients ---")
        await page.goto("http://localhost:8080/clients.html")
        await asyncio.sleep(3)

        print("--- Testing Stock ---")
        await page.goto("http://localhost:8080/stock.html")
        await asyncio.sleep(3)

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_permissions())
