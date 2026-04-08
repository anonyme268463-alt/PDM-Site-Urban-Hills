from playwright.sync_api import sync_playwright
import os

def run_verification(page):
    # Use file:// to access the static files
    file_path = f"file://{os.getcwd()}/vehicles.html"
    page.goto(file_path)
    page.wait_for_timeout(1000)

    # Check for IDs we fixed
    print("Checking Vehicles Page IDs...")
    elements = ["vehicleRows", "vehicleModal", "modalTitle", "closeModal", "deleteVm", "cancelVm", "saveVm"]
    for el_id in elements:
        if page.query_selector(f"#{el_id}"):
            print(f"Found #{el_id}")
        else:
            print(f"MISSING #{el_id}")

    page.screenshot(path="/home/jules/verification/screenshots/vehicles_structure.png")

    file_path_ventes = f"file://{os.getcwd()}/ventes.html"
    page.goto(file_path_ventes)
    page.wait_for_timeout(1000)
    print("Checking Ventes Page IDs...")
    ventes_elements = ["txTable", "importCsvBtn", "dedupeBtn", "deleteSelectedBtn"]
    for el_id in ventes_elements:
        if page.query_selector(f"#{el_id}"):
            print(f"Found #{el_id}")
        else:
            print(f"MISSING #{el_id}")
    page.screenshot(path="/home/jules/verification/screenshots/ventes_structure.png")

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(record_video_dir="/home/jules/verification/videos")
        page = context.new_page()
        try:
            run_verification(page)
        finally:
            context.close()
            browser.close()
