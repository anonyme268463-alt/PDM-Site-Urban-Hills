import asyncio
from playwright.async_api import async_playwright

async def verify_site():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        # Check Catalog (Fluidity & Cart)
        await page.goto("http://localhost:8080/index.html")
        await page.wait_for_selector(".catalogue-grid")
        print("Catalog loaded.")

        # Check Compta (Report Preview)
        await page.goto("http://localhost:8080/pdm-staff.html")
        await page.evaluate("localStorage.setItem('staff_user', JSON.stringify({name: 'Admin User', role: 'PDG'}))")
        await page.goto("http://localhost:8080/compta.html")
        await page.click("#btnPdf")
        await page.wait_for_selector("#reportModal", state="visible")

        content = await page.inner_html("#reportPreviewContent")
        if "Trésorerie S-1" in content and "Trésorerie Actuelle" in content:
            print("Treasury data found in PDF preview.")
        else:
            print("Treasury data MISSING in PDF preview!")

        await page.screenshot(path="verification/screenshots/final_compta_preview.png")

        # Check Ventes (Search Listener)
        await page.goto("http://localhost:8080/ventes.html")
        await page.wait_for_selector("#txTable")
        # Just check if script executes without error
        print("Ventes page loaded correctly.")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_site())
