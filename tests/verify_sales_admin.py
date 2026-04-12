import asyncio
from playwright.async_api import async_playwright

async def verify_sales_admin():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto("http://localhost:8080/pdm-staff.html")
        await page.evaluate("localStorage.setItem('staff_user', JSON.stringify({name: 'Admin User', role: 'PDG'}))")

        # Go to sales page
        await page.goto("http://localhost:8080/ventes.html")

        # Wait for the table to load at least something
        await page.locator("#txTable").wait_for()

        # Check if admin buttons are visible (they shouldn't have 'hidden' class for admin)
        import_btn = page.locator("#importCsvBtn")
        await import_btn.wait_for(state="attached")

        classes = await import_btn.get_attribute("class")
        if "hidden" not in classes:
            print("Import button is VISIBLE for PDG.")
        else:
            print("Import button is HIDDEN for PDG (Unexpected)!")

        # Simulate Staff user
        await page.evaluate("localStorage.setItem('staff_user', JSON.stringify({name: 'Staff User', role: 'Staff'}))")
        await page.reload()
        await page.locator("#txTable").wait_for()

        classes = await import_btn.get_attribute("class")
        if "hidden" in classes:
            print("Import button is HIDDEN for Staff.")
        else:
            print("Import button is VISIBLE for Staff (Unexpected)!")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_sales_admin())
