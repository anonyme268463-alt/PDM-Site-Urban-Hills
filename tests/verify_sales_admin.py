import asyncio
from playwright.async_api import async_playwright

async def verify_sales_admin():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        # Bypass auth for testing if possible, or simulate login
        # Since I am Jules and I have access to the code, I know guard.js looks for 'staff_user' in localStorage
        await page.goto("http://localhost:8080/pdm-staff.html")
        await page.evaluate("localStorage.setItem('staff_user', JSON.stringify({name: 'Admin User', role: 'PDG'}))")

        # Go to sales page
        await page.goto("http://localhost:8080/ventes.html")

        # Check if admin buttons are visible
        import_btn = page.locator("#importCsvBtn")
        dedupe_btn = page.locator("#dedupeBtn")
        delete_selected_btn = page.locator("#deleteSelectedBtn")

        await import_btn.wait_for(state="visible")
        await dedupe_btn.wait_for(state="visible")
        await delete_selected_btn.wait_for(state="visible")

        print("Admin buttons (Import, Dedupe, Delete Selected) are visible for PDG.")

        # Take a screenshot
        await page.screenshot(path="verification/screenshots/sales_admin_ui.png")

        # Simulate Staff user
        await page.evaluate("localStorage.setItem('staff_user', JSON.stringify({name: 'Staff User', role: 'Staff'}))")
        await page.reload()

        # Check if admin buttons are hidden
        await import_btn.wait_for(state="hidden")
        await dedupe_btn.wait_for(state="hidden")
        await delete_selected_btn.wait_for(state="hidden")

        print("Admin buttons are hidden for Staff.")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_sales_admin())
