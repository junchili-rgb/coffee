"""Exercise the app on a plain static server, including the Pages /coffee/ path.

Requires Python Playwright and Chromium; no Node application server is used.
Run: COFFEE_BROWSER_EXECUTABLE=/usr/bin/chromium python tests/pages-browser.py
"""

import functools
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
STORAGE_KEY = "coffee-journal-v1"
ASSETS = ["index.html", ".nojekyll", "src/app.js", "src/model.js", "src/style.css"]


class StaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def exercise(browser, base_url, width, backups, legacy):
    context = browser.new_context(viewport={"width": width, "height": 900}, accept_downloads=True)
    page = context.new_page()
    errors, failed_requests, responses = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("requestfailed", lambda request: failed_requests.append(request.url))
    page.on("response", lambda response: responses.append((response.url, response.status)))
    page.on("dialog", lambda dialog: dialog.accept())
    page.goto(base_url)
    expect(page.locator("#view-brew")).to_be_visible()
    assert page.locator(".record").count() == 7
    paths = {urlparse(url).path for url, status in responses if status == 200}
    for name in ASSETS[2:]:
        assert "/coffee/" + name in paths, (width, name, paths)

    # An existing v1 backup is read unchanged; unrelated localStorage is retained.
    page.evaluate("""({key, data}) => {
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem('pages-test-unrelated', 'keep');
    }""", {"key": STORAGE_KEY, "data": legacy})
    page.reload()
    assert page.locator(".record").count() == 8
    assert json.loads(page.evaluate("key => localStorage.getItem(key)", STORAGE_KEY)) == legacy
    page.locator("#tab-history").click()
    page.locator(".record").first.locator("summary").click()
    page.locator(".record").first.locator("[data-action=copy]").click()
    expect(page.locator("#view-brew")).to_be_visible()
    expect(page.locator("[name=dose]")).to_have_value("19")
    expect(page.locator("[name=yieldWeight]")).to_have_value("46")

    page.locator("[name=yieldWeight]").fill("48")
    page.locator("#recipe-details > summary").click()
    page.locator("[name=water]").fill("120")
    page.locator("[name=ice]").fill("100")
    page.locator("[name=temperature]").select_option("升一档")
    page.locator("#recipe-details > summary").click()
    page.locator('[name=tastes][value="尖酸"]').check()
    page.locator("#observation-details > summary").click()
    page.locator('[name=phenomena][value="出液均匀"]').check()
    page.locator("[name=notes]").fill("Pages 验证：柑橘香，尖酸")
    page.locator("[name=satisfaction]").select_option("3")
    page.locator("[name=outcome]").select_option("变好")
    page.locator("#observation-details > summary").click()
    page.locator("#save-record").click()
    expect(page.locator("#view-advice")).to_be_visible()
    expect(page.locator("#advice-content")).to_contain_text("48g 增至 52g")
    assert page.locator(".record").count() == 9
    page.reload()
    expect(page.locator("#view-advice")).to_be_visible()
    assert page.locator(".record").count() == 9

    page.locator("#tab-history").click()
    first = page.locator(".record").first
    first.locator("summary").click()
    expect(first.locator(".diff")).to_contain_text("液重：46 → 48")
    expect(first.locator(".diff")).to_contain_text("变好")
    first.locator("[data-action=edit]").click()
    expect(page.locator("[name=water]")).to_have_value("120")
    expect(page.locator("[name=temperature]")).to_have_value("升一档")
    page.locator("[name=notes]").fill("编辑后：花香与回甘")
    page.locator("[name=best]").check()
    page.locator("#save-record").click()
    assert page.locator(".record").count() == 9
    expect(page.locator("#advice-content")).to_contain_text("保留这杯配方")

    page.locator(".backup > summary").click()
    with page.expect_download() as download:
        page.locator("#export-data").click()
    backup_path = backups / f"coffee-{width}.json"
    download.value.save_as(backup_path)
    exported = json.loads(backup_path.read_text())
    assert exported["version"] == 1
    assert len(exported["records"]) == 9
    assert exported["records"][-1]["notes"] == "编辑后：花香与回甘"
    assert exported["records"][-1]["best"] is True
    assert exported["records"][:7] == legacy["records"][:7]

    page.locator("#new-batch").click()
    page.locator('#batch-form [name=name]').fill("Pages 新豆批次")
    page.locator('#batch-form [name=origin]').fill("埃塞俄比亚")
    page.locator("#batch-form button").last.click()
    assert page.locator(".record").count() == 0
    page.locator("#tab-advice").click()
    expect(page.locator("#use-advised")).not_to_be_visible()
    page.locator("#tab-brew").click()
    page.locator("#recipe-details > summary").click()
    page.locator("[name=water]").fill("150")
    page.locator("[name=ice]").fill("80")
    page.locator('[name=tastes][value="偏淡"]').check()
    page.locator("#save-record").click()
    expect(page.locator("#advice-content")).to_contain_text("150g 减至 135g")

    page.locator("#import-file").set_input_files(backup_path)
    expect(page.locator(".record")).to_have_count(9)
    assert json.loads(page.evaluate("key => localStorage.getItem(key)", STORAGE_KEY)) == exported
    page.locator("#import-file").set_input_files({
        "name": "bad.json", "mimeType": "application/json", "buffer": b'{"version":99}'
    })
    expect(page.locator("#toast")).to_contain_text("导入失败")
    assert json.loads(page.evaluate("key => localStorage.getItem(key)", STORAGE_KEY)) == exported

    page.locator("#tab-history").click()
    page.locator(".record").first.locator("summary").click()
    page.locator(".record").first.locator("[data-action=delete]").click()
    expect(page.locator(".record")).to_have_count(8)
    page.reload()
    expect(page.locator(".record")).to_have_count(8)
    assert page.evaluate("localStorage.getItem('pages-test-unrelated')") == "keep"
    for tab in ["brew", "history", "advice"]:
        page.locator("#tab-" + tab).click()
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), (width, tab)
        page.reload()
        expect(page.locator("#view-" + tab)).to_be_visible()
    assert not errors, errors
    assert not failed_requests, failed_requests
    # Reloads can validate cached CSS/modules with 304 Not Modified.
    # First loads above still require 200 for every application asset.
    assert all(status in (200, 304) for _url, status in responses), responses
    assert all(urlparse(url).path.startswith('/coffee/') for url, _status in responses), responses
    context.close()
    print(f"PASS {width}px /coffee/: legacy storage, 7 historical records, create/edit/compare/advice, batches, export/import/delete, hash reload, assets, layout")


def main():
    legacy = json.loads(subprocess.check_output([
        "node", "--input-type=module", "-e",
        "import {initialData} from './src/model.js'; console.log(JSON.stringify(initialData()));"
    ], cwd=ROOT, text=True))
    legacy["records"].append({
        **legacy["records"][6], "id": "old-site-record", "label": "旧站点备份",
        "createdAt": "2026-10-11T00:00:00.000Z", "historical": False,
        "parentId": None, "best": False, "phenomena": ["出液均匀"],
        "notes": "迁移前已保存的记录", "water": 120, "ice": 100,
    })
    with tempfile.TemporaryDirectory(prefix="coffee-pages-") as temp:
        temp_root = Path(temp)
        for prefix in [temp_root, temp_root / "coffee"]:
            for name in ASSETS:
                target = prefix / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, target)
        server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(StaticHandler, directory=str(temp_root)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as playwright:
                executable = os.environ.get("COFFEE_BROWSER_EXECUTABLE") or shutil.which("chromium") or shutil.which("google-chrome")
                options = {"headless": True}
                if executable:
                    options["executable_path"] = executable
                browser = playwright.chromium.launch(**options)
                origin = f"http://127.0.0.1:{server.server_port}"
                page = browser.new_page()
                page.goto(origin + "/")
                expect(page.locator("#view-brew")).to_be_visible()
                assert page.locator(".record").count() == 7
                page.close()
                print("PASS root static hosting: app initializes with 7 records")
                # Visiting /coffee without a slash must redirect before relative assets resolve.
                page = browser.new_page()
                page.goto(origin + "/coffee")
                assert page.url == origin + "/coffee/#brew"
                expect(page.locator("#view-brew")).to_be_visible()
                page.close()
                for width in [390, 1280]:
                    exercise(browser, origin + "/coffee/", width, temp_root, legacy)
                browser.close()
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
