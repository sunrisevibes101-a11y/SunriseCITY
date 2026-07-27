#!/usr/bin/env python3
import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
VAULT = Path.home() / "Library/Mobile Documents/iCloud~md~obsidian/Documents/CLAUDE/CLAUDE"
CLAUDE_DIR = Path.home() / ".claude"
PROJECTS_DIR = VAULT / "1 - Projects"
MAX_HIRES_PER_PROJECT = 10

# Sioux Falls, SD -- largest city in the state, used as the real-weather reference point.
WEATHER_LAT, WEATHER_LON = 43.5446, -96.7311
_weather_cache = {"data": None, "checked_at": 0}


def get_weather():
    """Real current weather for Sioux Falls, SD via Open-Meteo (free, no API key). Cached 15 min."""
    import time
    now = time.time()
    if _weather_cache["data"] and now - _weather_cache["checked_at"] < 900:
        return _weather_cache["data"]
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast?latitude={WEATHER_LAT}&longitude={WEATHER_LON}"
            "&current=temperature_2m,weather_code,is_day&temperature_unit=fahrenheit"
        )
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
        current = data.get("current", {})
        result = {
            "temp_f": current.get("temperature_2m"),
            "weather_code": current.get("weather_code"),
            "is_day": bool(current.get("is_day")),
            "location": "Sioux Falls, SD",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
        _weather_cache["data"] = result
        _weather_cache["checked_at"] = now
        return result
    except Exception as e:
        return {"error": str(e), "location": "Sioux Falls, SD"}


# --- Trading Room: SIMULATED paper trading only. Real market prices (Yahoo Finance,
# free, no key), fake money, a simple transparent rule -- never a real account,
# never a real trade, never implied to be AI making live decisions. ------------
WATCHLIST = ["NVDA", "AAPL", "SPY"]
TRADING_DIR = VAULT / "3 - Resources" / "Trading Room"
PORTFOLIO_FILE = TRADING_DIR / "portfolio.json"
STARTING_CASH = 10000.0
_price_cache = {"data": None, "checked_at": 0}


def get_real_prices():
    import time
    now = time.time()
    if _price_cache["data"] and now - _price_cache["checked_at"] < 900:
        return _price_cache["data"]
    prices = {}
    for ticker in WATCHLIST:
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read())
            meta = data["chart"]["result"][0]["meta"]
            prices[ticker] = round(meta["regularMarketPrice"], 2)
        except Exception:
            pass
    if prices:
        _price_cache["data"] = prices
        _price_cache["checked_at"] = now
        return prices
    return _price_cache["data"] or {}


def _load_portfolio():
    default = {"cash": STARTING_CASH, "holdings": {}, "trades": [], "last_prices": {}}
    if not PORTFOLIO_FILE.exists():
        return default
    try:
        return json.loads(PORTFOLIO_FILE.read_text())
    except json.JSONDecodeError:
        # Simulated data only, zero real stakes -- degrade to a fresh portfolio
        # instead of taking the whole dashboard down over a corrupted game file.
        print(f"[trading] portfolio.json corrupted, resetting to default")
        return default


def _save_portfolio(p):
    TRADING_DIR.mkdir(parents=True, exist_ok=True)
    tmp = PORTFOLIO_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(p, indent=2))
    tmp.replace(PORTFOLIO_FILE)  # atomic swap -- avoids concurrent-write corruption


def run_trading_tick():
    """Simple, transparent rule (not a live AI decision): if a watched ticker moved
    >=1.5% since the last tick, buy a small dip or trim a small rally. Runs at most
    once per price-cache refresh (~15 min) so it can't spam trades."""
    prices = get_real_prices()
    if not prices:
        return
    portfolio = _load_portfolio()
    last = portfolio.get("last_prices", {})
    changed = False
    for ticker, price in prices.items():
        prev = last.get(ticker)
        if prev:
            pct = (price - prev) / prev * 100
            shares_held = portfolio["holdings"].get(ticker, 0)
            if pct <= -1.5 and portfolio["cash"] >= 500:
                shares = round(500 / price, 4)
                portfolio["cash"] -= 500
                portfolio["holdings"][ticker] = shares_held + shares
                portfolio["trades"].insert(0, {
                    "when": datetime.now(timezone.utc).isoformat(), "action": "BUY",
                    "ticker": ticker, "shares": shares, "price": price,
                    "reason": f"dropped {pct:.1f}% -- simple dip-buy rule",
                })
                changed = True
            elif pct >= 1.5 and shares_held > 0:
                sell_shares = round(shares_held * 0.4, 4)
                proceeds = round(sell_shares * price, 2)
                portfolio["cash"] += proceeds
                portfolio["holdings"][ticker] = round(shares_held - sell_shares, 4)
                portfolio["trades"].insert(0, {
                    "when": datetime.now(timezone.utc).isoformat(), "action": "SELL",
                    "ticker": ticker, "shares": sell_shares, "price": price,
                    "reason": f"rose {pct:.1f}% -- simple trim-rally rule",
                })
                changed = True
    portfolio["last_prices"] = prices
    portfolio["trades"] = portfolio["trades"][:30]
    if changed or not PORTFOLIO_FILE.exists():
        _save_portfolio(portfolio)
    return portfolio


def get_trading_status():
    portfolio = run_trading_tick() or _load_portfolio()
    prices = get_real_prices()
    holdings_value = sum(portfolio["holdings"].get(t, 0) * prices.get(t, 0) for t in WATCHLIST)
    total_value = portfolio["cash"] + holdings_value
    return {
        "simulated": True,
        "cash": round(portfolio["cash"], 2),
        "holdings": portfolio["holdings"],
        "prices": prices,
        "portfolio_value": round(total_value, 2),
        "starting_value": STARTING_CASH,
        "gain_loss": round(total_value - STARTING_CASH, 2),
        "gain_loss_pct": round((total_value - STARTING_CASH) / STARTING_CASH * 100, 2),
        "trades": portfolio["trades"][:10],
    }


# Core roster: shared across every project, with character identity for the city view.
AGENT_ROSTER = [
    {"name": "council-researcher", "char_name": "Ada", "role": "Gathers facts, market data, precedent",
     "trait": "meticulous, slightly blunt, distrusts unsourced numbers", "color": "#5cc8ff"},
    {"name": "council-strategist", "char_name": "Milo", "role": "Proposes business/marketing options",
     "trait": "big-picture, decisive, always picks a side", "color": "#ffb454"},
    {"name": "council-critic", "char_name": "Reyes", "role": "Red-teams every plan before it ships",
     "trait": "skeptical, protective, says the quiet part out loud", "color": "#ff6b6b"},
    {"name": "council-writer", "char_name": "Sasha", "role": "Drafts customer-facing copy",
     "trait": "warm, persuasive, allergic to corporate fluff", "color": "#c874ff"},
    {"name": "council-chairman", "char_name": "Priya", "role": "Synthesizes the final recommendation",
     "trait": "no-nonsense, synthesizes fast, hates mush", "color": "#7c5cff"},
    {"name": "content-planner", "char_name": "Devon", "role": "Plans weekly content themes per platform",
     "trait": "organized, platform-nerd, thinks in calendars", "color": "#35d0ba"},
    {"name": "trading-room-manager", "char_name": "Sterling", "role": "Runs the simulated paper-trading portfolio",
     "trait": "calm, rule-following, never touches real money", "color": "#4ade9c"},
]


def _md_files(folder: Path):
    if not folder.exists():
        return []
    return sorted(
        [f for f in folder.glob("*.md") if not f.name.startswith("_")],
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )


def _rel_id(f: Path) -> str:
    return f.relative_to(VAULT).as_posix()


def _mtime_iso(f: Path) -> str:
    return datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat()


def _count_leads_in_log(f: Path) -> int:
    return len(_parse_leads_log(f))


def _parse_leads_log(f: Path) -> list:
    if not f.exists():
        return []
    text = f.read_text(errors="ignore")
    entries = []
    for block in text.split("\n## ")[1:]:
        lines = block.strip().splitlines()
        header = lines[0] if lines else ""
        when, _, name = header.partition(" — ")
        fields = {"when": when.strip(), "name": name.strip() or "(no name)"}
        for line in lines[1:]:
            m = re.match(r"-\s*(\w[\w ]*):\s*(.*)", line.strip())
            if m:
                fields[m.group(1).strip().lower()] = m.group(2).strip()
        entries.append(fields)
    return entries


def _parse_frontmatter(text: str) -> dict:
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    meta = {}
    for line in parts[1].strip().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta


# --- Authored dialogue bank -------------------------------------------------
# Real lines, written for each agent, chosen by actual project state.
# Not live-generated per click -- refreshed by hand whenever real work changes.
DIALOGUE = {
    "council-researcher": {
        "queue": "Still triple-checking those local-search stats before Priya signs off on anything.",
        "recent_council": "Pulled everything I could verify for the last session -- flagged what was vendor-sourced vs. real.",
        "idle": "Nothing active right now. I'll go re-check the GBP numbers for drift.",
    },
    "council-strategist": {
        "queue": "My bet's in the doc -- referral loop first, GBP as backstop. Waiting on the human to actually read it.",
        "recent_council": "Laid out three options again. Told them which one I'd bet on and why.",
        "idle": "No live question on the table. Thinking about what the next bottleneck will be.",
    },
    "council-critic": {
        "queue": "Someone still needs to fix the cold-start reputation gap before I'll sign off on this plan.",
        "recent_council": "Found the weak assumption. As usual, nobody wants to hear it.",
        "idle": "Quiet for now. I'll go re-read the last plan for anything we missed.",
    },
    "council-writer": {
        "queue": "Copy's drafted, three variants, all marked DRAFT. Not sending anything until someone says go.",
        "recent_content": "Wrote this week's batch -- tried to make the LinkedIn post actually sound like a person.",
        "idle": "No brief yet. I'll sketch some hooks for whenever one lands.",
    },
    "council-chairman": {
        "queue": "My recommendation's written. I overruled the invented stats -- kept the sequencing logic.",
        "recent_council": "Synthesized it. Told them exactly what I discounted and why.",
        "idle": "No deliberation running. I don't get a first opinion, so I'm just here.",
    },
    "content-planner": {
        "queue": "Week's mapped out -- LinkedIn once, X daily, no forcing content that doesn't fit the platform.",
        "recent_content": "Planned the week around what's actually true about the business, not filler themes.",
        "idle": "No content cycle running right now.",
    },
}


def dialogue_for(agent_name: str, project: dict) -> str:
    if agent_name == "trading-room-manager":
        t = get_trading_status()
        sign = "up" if t["gain_loss"] >= 0 else "down"
        return f"Paper portfolio is {sign} ${abs(t['gain_loss']):.2f} ({t['gain_loss_pct']:+.1f}%) since we started. Simulated only -- no real money."
    bank = DIALOGUE.get(agent_name, {})
    if project["queue"]:
        return bank.get("queue", "Working on it.")
    if agent_name in ("council-researcher", "council-strategist", "council-critic", "council-chairman") and project["council_count"] > 0:
        return bank.get("recent_council", bank.get("idle", "..."))
    if agent_name in ("council-writer", "content-planner") and project["content_count"] > 0:
        return bank.get("recent_content", bank.get("idle", "..."))
    return bank.get("idle", "Nothing active.")


def build_project(project_dir: Path):
    council_dir = project_dir / "Council Sessions"
    content_dir = project_dir / "Content"
    leads_dir = project_dir / "Leads"
    research_dir = project_dir / "Research"
    hiring_dir = project_dir / "Hiring"

    council_files = _md_files(council_dir)
    content_files = _md_files(content_dir)
    leads_log = leads_dir / "leads-log.md"
    leads_entries = _parse_leads_log(leads_log)
    leads_count = len(leads_entries)

    queue = []
    content_index = []
    for f in content_files:
        text = f.read_text(errors="ignore")
        approved = "APPROVED BY USER" in text
        content_index.append({"id": _rel_id(f), "title": f.stem, "approved": approved, "project": project_dir.name})
        if not approved:
            queue.append({"id": _rel_id(f), "title": f.stem, "kind": "content-batch", "project": project_dir.name})

    hired = []
    for f in _md_files(hiring_dir) if hiring_dir.exists() else []:
        text = f.read_text(errors="ignore")
        meta = _parse_frontmatter(text)
        if meta.get("status") == "pending":
            queue.append({
                "id": _rel_id(f), "title": f"Hire: {meta.get('char_name', f.stem)} ({f.stem})",
                "kind": "hire", "project": project_dir.name,
                "char_name": meta.get("char_name", f.stem), "trait": meta.get("trait", ""),
            })
        elif meta.get("status") == "hired":
            hired.append({"name": f.stem, "char_name": meta.get("char_name", f.stem), "trait": meta.get("trait", "")})

    prospects_dir = project_dir / "Leads" / "Prospects"
    approved_prospects = []
    all_prospects = []
    for f in _md_files(prospects_dir) if prospects_dir.exists() else []:
        text = f.read_text(errors="ignore")
        meta = _parse_frontmatter(text)
        status = meta.get("status", "pending")
        all_prospects.append({
            "id": _rel_id(f), "business_name": meta.get("business_name", f.stem),
            "location": meta.get("location", ""), "industry": meta.get("industry", ""),
            "web_status": meta.get("web_status", ""), "status": status,
            "source": meta.get("source", ""), "found_at": meta.get("found_at", ""),
            "project": project_dir.name,
        })
        if status == "pending":
            queue.append({
                "id": _rel_id(f), "title": f"Lead: {meta.get('business_name', f.stem)}",
                "kind": "prospect", "project": project_dir.name,
                "business_name": meta.get("business_name", f.stem),
                "location": meta.get("location", ""), "web_status": meta.get("web_status", ""),
            })
        elif status == "approved":
            approved_prospects.append({"name": meta.get("business_name", f.stem), "location": meta.get("location", "")})

    activity = []
    for f in council_files[:5]:
        activity.append({"when": _mtime_iso(f), "text": f"Council session: {f.stem}", "project": project_dir.name})
    for f in content_files[:5]:
        activity.append({"when": _mtime_iso(f), "text": f"Content batch drafted: {f.stem}", "project": project_dir.name})
    if leads_log.exists():
        activity.append({"when": _mtime_iso(leads_log), "text": f"Leads log updated ({leads_count} total)", "project": project_dir.name})

    all_files = council_files + content_files
    last_active = max((_mtime_iso(f) for f in all_files), default=None)

    project = {
        "name": project_dir.name,
        "council_count": len(council_files),
        "content_count": len(content_files),
        "leads_count": leads_count,
        "research_count": len(_md_files(research_dir)),
        "queue": queue,
        "activity": activity,
        "last_active": last_active,
        "hired_agents": hired,
        "hired_count": len(hired),
        "hire_slots_left": max(0, MAX_HIRES_PER_PROJECT - len(hired)),
        "content_index": content_index,
        "leads": list(reversed(leads_entries)),
        "approved_prospects": approved_prospects,
        "all_prospects": all_prospects,
    }

    roster = []
    for agent in AGENT_ROSTER:
        roster.append({**agent, "line": dialogue_for(agent["name"], project)})
    for h in hired:
        roster.append({
            "name": h["name"], "char_name": h["char_name"], "role": "hired specialist",
            "trait": h["trait"], "color": "#e8b4ff",
            "line": f"Brought on for {project_dir.name.split(' (')[0]} specifically.",
        })
    project["roster"] = roster

    return project


def build_status():
    projects = []
    if PROJECTS_DIR.exists():
        for p in sorted(PROJECTS_DIR.iterdir()):
            if p.is_dir():
                projects.append(build_project(p))

    skills = sorted([p.name for p in (CLAUDE_DIR / "skills").iterdir() if p.is_dir()]) if (CLAUDE_DIR / "skills").exists() else []
    agents = sorted([p.stem for p in (CLAUDE_DIR / "agents").glob("*.md")]) if (CLAUDE_DIR / "agents").exists() else []

    all_queue = [item for proj in projects for item in proj["queue"]]
    all_activity = sorted(
        (item for proj in projects for item in proj["activity"]),
        key=lambda a: a["when"], reverse=True,
    )[:10]

    return {
        "vault_found": VAULT.exists(),
        "projects": projects,
        "roster": AGENT_ROSTER,
        "skills_installed": skills,
        "agents_installed": agents,
        "queue": all_queue,
        "activity": all_activity,
        "weather": get_weather(),
        "trading": get_trading_status(),
        "instructions": _read_instructions(),
        "posted": _parse_posted_log()[:20],
        "links": [
            {"label": "🌐 Demo site (lead form)", "url": "http://localhost:8420"},
            {"label": "📦 SunriseCITY repo", "url": "https://github.com/sunrisevibes101-a11y/SunriseCITY"},
            {"label": "☁️ Cloud routines", "url": "https://claude.ai/code/routines"},
            {"label": "🔌 Connect accounts (posting/revenue)", "url": "https://claude.ai/customize/connectors"},
        ],
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


INSTRUCTIONS_FILE = VAULT / "0 - Inbox" / "Owner Instructions.md"


def _read_instructions():
    if not INSTRUCTIONS_FILE.exists():
        return []
    entries = []
    for block in INSTRUCTIONS_FILE.read_text(errors="ignore").split("\n## ")[1:]:
        lines = block.strip().splitlines()
        if not lines:
            continue
        entries.append({"when": lines[0], "text": "\n".join(lines[1:]).strip()})
    return entries[:15]


def add_instruction(text: str):
    text = text.strip()
    if not text:
        return False, "empty"
    header = "# Owner Instructions\n\nMessages typed into the Command Center dashboard, for a Claude Code session (manual or the daily SunriseCITY run) to read and act on. Newest first. Nothing here executes automatically by itself -- it's picked up the next time an agent session runs, same approval rules as everything else apply.\n\n"
    block = f"## {datetime.now(timezone.utc).isoformat()}\n{text}\n\n"
    if INSTRUCTIONS_FILE.exists():
        existing = INSTRUCTIONS_FILE.read_text()
        if existing.startswith("# Owner Instructions"):
            head, sep, rest = existing.partition("\n\n")
            new = head + sep + block + rest
        else:
            new = header + block + existing
    else:
        INSTRUCTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
        new = header + block
    INSTRUCTIONS_FILE.write_text(new)
    return True, "saved"


POSTED_LOG = VAULT / "3 - Resources" / "Posted Log.md"


def _parse_posted_log():
    if not POSTED_LOG.exists():
        return []
    entries = []
    for block in POSTED_LOG.read_text(errors="ignore").split("\n## ")[1:]:
        lines = block.strip().splitlines()
        header = lines[0] if lines else ""
        parts = [p.strip() for p in header.split("—")]
        entry = {
            "when": parts[0] if parts else "",
            "platform": parts[1] if len(parts) > 1 else "",
            "account": parts[2] if len(parts) > 2 else "",
        }
        for line in lines[1:]:
            m = re.match(r"-\s*(\w+):\s*(.*)", line.strip())
            if m:
                entry[m.group(1).lower()] = m.group(2)
        entries.append(entry)
    return entries


def log_posted(item_id: str, platform: str, account: str):
    target = (VAULT / item_id).resolve()
    if VAULT not in target.parents or not target.exists():
        return False, "batch not found"
    platform = platform.strip()[:40]
    account = account.strip()[:80] or "(account not given)"
    header = "# Posted Log\n\nManual record of what was actually posted where. Newest first.\n\n"
    block = (
        f"## {datetime.now(timezone.utc).isoformat()} — {platform} — {account}\n"
        f"- Batch: {target.stem}\n"
        f"- Project: {target.parent.parent.name}\n\n"
    )
    if POSTED_LOG.exists():
        existing = POSTED_LOG.read_text()
        if existing.startswith("# Posted Log"):
            head, sep, rest = existing.partition("\n\n")
            new = head + sep + block + rest
        else:
            new = header + block + existing
    else:
        new = header + block
    POSTED_LOG.write_text(new)
    return True, "logged"


def approve_item(item_id: str):
    target = (VAULT / item_id).resolve()
    if VAULT not in target.parents or not target.exists():
        return False, "not found"
    text = target.read_text(errors="ignore")

    if target.parent.name == "Hiring":
        meta = _parse_frontmatter(text)
        if meta.get("status") == "hired":
            return True, "already hired"
        project_dir = target.parent.parent
        current_hired = sum(
            1 for f in (project_dir / "Hiring").glob("*.md")
            if _parse_frontmatter(f.read_text(errors="ignore")).get("status") == "hired"
        )
        if current_hired >= MAX_HIRES_PER_PROJECT:
            return False, f"hire cap reached ({MAX_HIRES_PER_PROJECT} per project)"

        # Body after frontmatter is the actual subagent file content.
        parts = text.split("---", 2)
        agent_body = parts[2].strip() + "\n" if len(parts) >= 3 else text

        agent_name_match = re.search(r"^name:\s*(\S+)", agent_body, flags=re.M)
        agent_filename = (agent_name_match.group(1) if agent_name_match else target.stem) + ".md"
        agent_file = CLAUDE_DIR / "agents" / agent_filename
        agent_file.write_text("---\n" + agent_body)

        new_text = re.sub(r"status:\s*pending", "status: hired", text, count=1)
        target.write_text(new_text)
        return True, f"hired -- wrote {agent_file.name}"

    if target.parent.name == "Prospects":
        meta = _parse_frontmatter(text)
        if meta.get("status") == "approved":
            return True, "already approved"
        new_text = re.sub(r"status:\s*pending", "status: approved", text, count=1)
        target.write_text(new_text)
        return True, "approved -- ready for outreach (still needs its own explicit send confirmation)"

    if "APPROVED BY USER" in text:
        return True, "already approved"
    stamp = f"\n> **APPROVED BY USER** — {datetime.now(timezone.utc).isoformat()}\n"
    target.write_text(text + stamp)
    return True, "approved"


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path == "/api/approve":
            length = int(self.headers.get("Content-Length", 0))
            try:
                data = json.loads(self.rfile.read(length))
                item_id = data["id"]
            except Exception:
                self._send_json(400, {"error": "invalid request"})
                return
            ok, msg = approve_item(item_id)
            self._send_json(200 if ok else 404, {"ok": ok, "message": msg})
            return
        if self.path == "/api/posted":
            length = int(self.headers.get("Content-Length", 0))
            try:
                data = json.loads(self.rfile.read(length))
                ok, msg = log_posted(data["id"], data.get("platform", ""), data.get("account", ""))
            except Exception:
                self._send_json(400, {"error": "invalid request"})
                return
            self._send_json(200 if ok else 404, {"ok": ok, "message": msg})
            return
        if self.path == "/api/instruct":
            length = int(self.headers.get("Content-Length", 0))
            try:
                data = json.loads(self.rfile.read(length))
                ok, msg = add_instruction(data.get("text", ""))
            except Exception:
                self._send_json(400, {"error": "invalid request"})
                return
            self._send_json(200 if ok else 400, {"ok": ok, "message": msg})
            return
        self._send_json(404, {"error": "not found"})

    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/status":
            self._send_json(200, build_status())
            return
        if path == "/api/file":
            qs = parse_qs(parsed.query)
            item_id = qs.get("path", [""])[0]
            target = (VAULT / item_id).resolve()
            if VAULT not in target.parents or not target.exists():
                self._send_json(404, {"error": "not found"})
                return
            self._send_json(200, {"content": target.read_text(errors="ignore")})
            return
        if path == "/":
            path = "/index.html"
        file_path = (ROOT / path.lstrip("/")).resolve()
        if ROOT not in file_path.parents and file_path != ROOT:
            self._send_json(403, {"error": "forbidden"})
            return
        if not file_path.exists() or not file_path.is_file():
            self._send_json(404, {"error": "not found"})
            return
        ctype = "text/html"
        if file_path.suffix == ".css":
            ctype = "text/css"
        elif file_path.suffix == ".js":
            ctype = "application/javascript"
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[server] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8777))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Command Center serving on http://127.0.0.1:{port}")
    httpd.serve_forever()
