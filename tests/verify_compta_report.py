import asyncio
from playwright.async_api import async_playwright

async def verify_report():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        # We know compta.html redirects to login if not auth'd
        # But the DOM should still be present briefly or we can inspect the source
        await page.goto("http://localhost:8080/compta.html", wait_until="commit")

        # Check if the modal exists in the content
        content = await page.content()
        if "reportModal" in content:
            print("Report preview modal exists in the HTML.")
        else:
            print("Report preview modal NOT found in page content!")
            # Print a bit of the content to see where we are
            print(content[:500])

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_report())
