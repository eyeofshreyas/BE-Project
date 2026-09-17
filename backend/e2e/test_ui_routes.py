"""UI smoke test: drives headless Chrome over CDP, logs in through the real login
form as each role and walks every route, looking for blank pages, JS exceptions
and error text.

Run it against a running stack, from backend/:

    .venv/bin/python e2e/test_ui_routes.py
"""
import os

# Seeded demo-firm accounts (seed_demo_firm.py). Override for a different seed.
ADMIN_EMAIL = os.environ.get("E2E_ADMIN", "seed-admin-2xj0n@example.com")
LAWYER_EMAIL = os.environ.get("E2E_LAWYER", "seed-lawyer1-2xj0n@example.com")
CLIENT_EMAIL = os.environ.get("E2E_CLIENT", "seed-client1-2xj0n@example.com")
PW = os.environ.get("E2E_PASSWORD", "TestPass123!")
import asyncio
import json
import subprocess
import time
import urllib.request

import websockets

APP = "http://localhost:5173"
CHROME = "/usr/bin/google-chrome-stable"
PORT = 9222

ACCOUNTS = {
    "admin": (ADMIN_EMAIL, PW),
    "lawyer": (LAWYER_EMAIL, PW),
    "client": (CLIENT_EMAIL, PW),
}

ROUTES = [
    "/dashboard", "/cases", "/hearings", "/documents", "/billing", "/messages",
    "/clients", "/conveyancing", "/judgements", "/notifications", "/settings",
    "/admin",
]

PROBLEMS = []
DUMP = set()   # add a route here to print its rendered text


class Tab:
    def __init__(self, ws):
        self.ws = ws
        self.n = 0
        self.console = []

    async def send(self, method, **params):
        self.n += 1
        await self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("method") == "Runtime.consoleAPICalled":
                if msg["params"]["type"] in ("error", "warning"):
                    text = " ".join(str(a.get("value", a.get("description", "")))
                                    for a in msg["params"]["args"])
                    self.console.append(("console." + msg["params"]["type"], text))
            elif msg.get("method") == "Runtime.exceptionThrown":
                d = msg["params"]["exceptionDetails"]
                self.console.append(("exception", d.get("text", "") + " " +
                                     str(d.get("exception", {}).get("description", ""))))
            elif msg.get("id") == self.n:
                return msg.get("result", {})

    async def eval(self, expr):
        r = await self.send("Runtime.evaluate", expression=expr, returnByValue=True,
                            awaitPromise=True)
        return r.get("result", {}).get("value")

    async def goto(self, url):
        await self.send("Page.navigate", url=url)
        await asyncio.sleep(2.0)

    async def key(self, key, code, vk, text=None):
        """One real key press, dispatched at the browser rather than at an element --
        so what it exercises is what a person with only a keyboard can reach."""
        for kind in ("keyDown", "keyUp"):
            params = {"type": kind, "key": key, "code": code,
                      "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}
            if text and kind == "keyDown":
                params["text"] = text
            await self.send("Input.dispatchKeyEvent", **params)
            await asyncio.sleep(0.02)

    async def type_text(self, s):
        for ch in s:
            await self.send("Input.insertText", text=ch)
            await asyncio.sleep(0.01)

    async def tab_to(self, selector, limit=15):
        """Press Tab until the focused element matches, returning how many it took
        (None if it never gets there -- i.e. the control isn't keyboard-reachable)."""
        for i in range(1, limit + 1):
            await self.key("Tab", "Tab", 9)
            if await self.eval(f"!!document.activeElement && document.activeElement.matches({json.dumps(selector)})"):
                return i
        return None


async def wait_for(tab, expr, timeout=12.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if await tab.eval(expr):
            return True
        await asyncio.sleep(0.4)
    return False


async def run_role(tab, role, email, password):
    print(f"\n=== {role} ===")
    tab.console.clear()
    # clear on the app's own origin -- clearing while the tab is still on about:blank
    # leaves the previous role's session in place and the next login silently reuses it
    await tab.goto(APP + "/login")
    await tab.eval("localStorage.clear(); sessionStorage.clear()")
    await tab.goto(APP + "/login")

    if not await wait_for(tab, "!!document.querySelector('input[type=email], input[name=email]')"):
        PROBLEMS.append((role, "/login", "no email field rendered"))
        print("FAIL login form never rendered")
        return

    # Sign in with the keyboard alone -- Tab to each field, type, Enter to submit. No
    # click anywhere. The form used to be unsubmittable this way (the control was a
    # <div onClick>), so if anyone takes the <form>/<button type=submit> back out,
    # every role fails here rather than the regression reaching a screen reader.
    await tab.eval("document.activeElement && document.activeElement.blur()")
    if await tab.tab_to("#login-email") is None:
        PROBLEMS.append((role, "/login", "email field is not reachable by Tab"))
        print("FAIL login  email field not reachable by keyboard")
        return
    await tab.type_text(email)
    if await tab.tab_to("#login-password", limit=4) is None:
        PROBLEMS.append((role, "/login", "password field is not reachable by Tab"))
        print("FAIL login  password field not reachable by keyboard")
        return
    await tab.type_text(password)
    await tab.key("Enter", "Enter", 13, text="\r")

    logged_in = await wait_for(tab, "!!localStorage.getItem('lexflow_token')", timeout=20)
    who = await tab.eval("(JSON.parse(localStorage.getItem('lexflow_profile') || '{}') || {}).email")
    where = await tab.eval("location.pathname")
    if not logged_in:
        body = (await tab.eval("document.body.innerText") or "")[:200]
        PROBLEMS.append((role, "/login", f"login did not store a token (at {where}): {body}"))
        print(f"FAIL login  still at {where}")
        return
    if who != email:
        PROBLEMS.append((role, "/login", f"session belongs to {who}, expected {email}"))
        print(f"FAIL login  session is {who}, expected {email}")
        return
    print(f"PASS login  as {who} -> {where}")

    for route in ROUTES:
        tab.console.clear()
        await tab.goto(APP + route)
        await asyncio.sleep(1.2)
        info = await tab.eval("""
        (() => {
          const root = document.getElementById('root') || document.body;
          const text = (root.innerText || '').trim();
          return {
            path: location.pathname,
            len: text.length,
            head: text.slice(0, 400),
            nodes: root.querySelectorAll('*').length,
          };
        })()
        """) or {}
        path = info.get("path", route)
        text = info.get("head", "")
        low = text.lower()
        errors = [t for t in tab.console if t[0] == "exception"]

        if path == "/login":
            verdict, note = "FAIL", "bounced back to login"
        elif info.get("len", 0) < 30:
            verdict, note = "FAIL", f"renders essentially empty ({info.get('nodes')} nodes)"
        elif errors:
            verdict, note = "FAIL", f"JS exception: {errors[0][1][:160]}"
        elif any(s in low for s in ("something went wrong", "failed to fetch",
                                    "unexpected error", "cannot read properties")):
            verdict, note = "FAIL", f"error text on page: {text[:160]}"
        else:
            verdict, note = "PASS", f"{info.get('len')} chars"
        if verdict == "FAIL":
            PROBLEMS.append((role, route, note))
        print(f"{verdict} {route:<16} {note}")

        if route in DUMP:
            print(f"     TEXT[{role}{route}]: {text[:500]!r}")
        for kind, msg in tab.console:
            if kind == "console.error" and "404" not in msg:
                print(f"     console.error: {msg[:160]}")


async def main():
    proc = subprocess.Popen(
        [CHROME, "--headless=new", f"--remote-debugging-port={PORT}", "--no-sandbox",
         "--disable-gpu", "--window-size=1440,900", "--disable-dev-shm-usage",
         "--user-data-dir=/tmp/claude-chrome-e2e", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        ws_url = None
        for _ in range(40):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://localhost:{PORT}/json"))
                page = next((t for t in tabs if t["type"] == "page"), None)
                if page:
                    ws_url = page["webSocketDebuggerUrl"]
                    break
            except Exception:
                pass
            time.sleep(0.5)
        if not ws_url:
            print("could not reach Chrome's debugging port")
            return

        async with websockets.connect(ws_url, max_size=20_000_000) as ws:
            tab = Tab(ws)
            await tab.send("Page.enable")
            await tab.send("Runtime.enable")
            for role, (email, pw) in ACCOUNTS.items():
                await run_role(tab, role, email, pw)
    finally:
        proc.terminate()

    print("\n" + "=" * 72)
    if PROBLEMS:
        print(f"{len(PROBLEMS)} UI PROBLEMS")
        for role, route, note in PROBLEMS:
            print(f"  - [{role}] {route}: {note}")
    else:
        print("every route rendered for every role")


asyncio.run(main())
