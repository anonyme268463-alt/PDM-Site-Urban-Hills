from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    # Go to public catalog
    print("Navigating to public catalog...")
    page.goto("http://localhost:3000/index.html")
    page.wait_for_timeout(3000) # Wait for Firestore

    # Scroll down to the catalog grid
    print("Scrolling to catalog grid...")
    page.locator(".catalogue-grid").scroll_into_view_if_needed()
    page.wait_for_timeout(1000)

    page.screenshot(path="/home/jules/verification/screenshots/catalog_grid.png", full_page=True)

    # Try to see admin vehicles (will likely redirect to login)
    print("Navigating to admin vehicles...")
    page.goto("http://localhost:3000/vehicles.html")
    page.wait_for_timeout(2000)
    page.screenshot(path="/home/jules/verification/screenshots/admin_login_redirect.png")

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
