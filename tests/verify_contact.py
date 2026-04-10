import asyncio
from playwright.async_api import async_playwright

async def verify_contact_form():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Load the index page
        await page.goto("http://localhost:8080/index.html")

        # Check contact section title
        contact_title = page.locator("h2:has-text('Contact PDM')")
        await contact_title.wait_for()
        print("Contact section title found.")

        # Check contact form fields specifically within the contact form section
        contact_section = page.locator("#contact")

        fields = ["Nom Prénom", "Raison", "Date souhaitée", "Détails"]
        for field in fields:
            label = contact_section.locator(f"label:has-text('{field}')")
            await label.wait_for()
            print(f"Field '{field}' found.")

        # Verify the button text
        submit_btn = contact_section.locator("button:has-text('Envoyer la demande')")
        await submit_btn.wait_for()
        print("Submit button found.")

        # Take a screenshot for manual verification
        await page.screenshot(path="verification/screenshots/contact_section_verified.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_contact_form())
