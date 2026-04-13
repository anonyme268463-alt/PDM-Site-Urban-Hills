from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    # Check login page
    page.goto("http://localhost:8080/pdm-staff.html")
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/screenshots/login.png")

    # Try to access Sales page (will likely redirect, but let's see)
    page.goto("http://localhost:8080/ventes.html")
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/screenshots/ventes_redirect.png")

if __name__ == "__main__":
    if not os.path.exists("/home/jules/verification/screenshots"):
        os.makedirs("/home/jules/verification/screenshots")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
