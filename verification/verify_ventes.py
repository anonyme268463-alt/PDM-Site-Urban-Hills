import asyncio
from playwright.async_api import async_playwright
import os

async def verify_ventes_logic():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        # We need to bypass the auth guard for local testing or mock it
        # Since common.js redirects if pdm_logged_in is missing:
        await page.goto("http://localhost:8080/pdm-staff.html")
        await page.evaluate("localStorage.setItem('pdm_logged_in', 'true')")

        # Navigate to sales
        await page.goto("http://localhost:8080/ventes.html")

        # 1. Verify RBAC UI elements
        # We can't easily mock auth.currentUser without more setup, but we can check the default state
        # Or manually trigger the logic that sets visibility

        # Check if buttons exist in DOM
        import_btn = page.locator("#importCsvBtn")
        dedupe_btn = page.locator("#dedupeBtn")
        delete_sel_btn = page.locator("#deleteSelectedBtn")

        print(f"Import button exists: {await import_btn.count() > 0}")

        # 2. Verify CSV Date parsing logic (Unit test-like in the browser)
        # We can inject a script to test the date heuristic directly
        heuristic_test = """
        async () => {
            // Re-implement or expose the heuristic logic from handleCSV
            function parseCSVDate(dateStr) {
                const now = new Date(2026, 3, 7); // Mock "today" as April 7, 2026
                let parts = dateStr.split(/[\\/\\-\\s]/);
                if (parts.length === 3) {
                    let p0 = parseInt(parts[0]);
                    let p1 = parseInt(parts[1]);
                    let p2 = parseInt(parts[2]);
                    if (p2 < 100) p2 += 2000;

                    let dateA = new Date(p2, p1 - 1, p0, 12, 0, 0); // DD/MM/YYYY
                    let dateB = (p0 <= 12) ? new Date(p2, p0 - 1, p1, 12, 0, 0) : null; // MM/DD/YYYY

                    const validA = !isNaN(dateA.getTime());
                    const validB = dateB && !isNaN(dateB.getTime());

                    if (validA && validB) {
                        if (dateA > now && dateB <= now) return dateB;
                        return dateA;
                    } else if (validA) return dateA;
                    else if (validB) return dateB;
                }
                return new Date();
            }

            const results = {
                pastDate: parseCSVDate("02/12/2025").toLocaleDateString('fr-FR'), // Should be Dec 2, 2025
                ambiguousDate: parseCSVDate("07/04/2026").toLocaleDateString('fr-FR'), // Should be April 7, 2026
                problematicDate: parseCSVDate("02/12/2026").toLocaleDateString('fr-FR') // 02/12/2026 (DD/MM) is Dec 2, 2026 (Future). 12/02/2026 (MM/DD) is Feb 12, 2026 (Past).
            };
            return results;
        }
        """
        results = await page.evaluate(heuristic_test)
        print("CSV Date Heuristic Results:", results)

        # Expected: problematicDate should prefer the past one (Feb 12, 2026) instead of Dec 2, 2026
        # if 02/12/2026 is interpreted as DD/MM it's Dec 2026 (Future)
        # if 02/12/2026 is interpreted as MM/DD it's Feb 2026 (Past)

        await page.screenshot(path="verification_ventes.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_ventes_logic())
