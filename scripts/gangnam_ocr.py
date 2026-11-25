#!/usr/bin/env python3
"""Public Threads menu-video OCR. No vendor login, paid API, or user secrets.

Run on GitHub Actions in Asia/Seoul time. Downloads public RSS media ONLY from
allowlisted HTTPS CDNs, samples a few frames with FFmpeg, and runs Korean OCR.
It writes a small, public JSON verdict, NEVER screenshots or raw feed contents.
If evidence is insufficient, status is unverified and the website keeps its
existing manual selection UI.
"""
from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

SEOUL = ZoneInfo("Asia/Seoul")
VERSION = 1
FEED_URLS = (
    "https://rsshub.gneko.io/threads/gangnambab",
    "https://rsshub.isrss.com/threads/gangnambab",
)
RSS_HOSTS = {"rsshub.gneko.io", "rsshub.isrss.com", "rsshub.uocat.com"}
MEDIA_SUFFIXES = (
    "cdninstagram.com", "fbcdn.net", "cdnthreads.net",
    "threads.net", "threads.com", "instagram.com",
)
POST_RE = re.compile(r"^/(@gangnambab/post|t)/([A-Za-z0-9_-]+)/?$")
HEADER_RE = re.compile(r"메뉴표|식단표|오늘의?메뉴|오늘의?식단|점심메뉴|점심식단|주간식단|금일메뉴|금일식단|메뉴안내|메뉴공지|[월화수목금토일]요일(?:점심)?메뉴|\d{1,2}일(?:[월화수목금토일]요일)?메뉴")
FOODS = (
    "밥", "국", "탕", "김치", "찌개", "불고기", "제육", "돈까스", "돈가스",
    "생선", "샐러드", "나물", "고기", "카레", "면", "우동", "반찬", "떡볶이",
    "오징어", "비빔", "덮밥", "계란", "달걀", "양념", "닭", "두부", "볶음",
    "후식", "디저트", "국수", "파스타", "소스", "수프",
)
PROMOTION_RE = re.compile(r"오픈|개업|주년|이벤트|특가|쿠폰|식권|증정|사은품|프로모션|할인|무료|기념행사|[\d]+\s*\+\s*1|promotion|voucher|discount", re.I)
MAX_FEED = 800_000
MAX_MEDIA = 16 * 1024 * 1024
MAX_POSTS = 6
MAX_SECONDS = 18
SAMPLE_SECONDS = (0.45, 1.2, 1.95, 2.7, 3.45, 4.2, 5.1, 6.2, 7.6)


def allowed(url: str, media: bool = False) -> bool:
    if not isinstance(url, str) or len(url) > 3000:
        return False
    try:
        p = urllib.parse.urlsplit(url)
        if p.scheme != "https" or p.username or p.password or p.port not in (None, 443):
            return False
        host = (p.hostname or "").lower()
        if media:
            return any(host == domain or host.endswith("." + domain) for domain in MEDIA_SUFFIXES)
        return host in RSS_HOSTS and p.path.rstrip("/") == "/threads/gangnambab"
    except (ValueError, TypeError):
        return False


def valid_post(url: str) -> str:
    try:
        p = urllib.parse.urlsplit(url)
        if p.scheme != "https" or p.hostname not in {"www.threads.com", "threads.com"}:
            return ""
        match = POST_RE.fullmatch(p.path)
        if match:
            return "https://www.threads.com/@gangnambab/post/" + match.group(2)
    except (ValueError, TypeError):
        pass
    return ""


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, media: bool):
        self.media = media

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        if not allowed(newurl, media=self.media):
            raise ValueError("redirect to disallowed host")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def download(url: str, media: bool, limit: int) -> bytes:
    if not allowed(url, media=media):
        raise ValueError("source URL is not allowed")
    opener = urllib.request.build_opener(SafeRedirect(media))
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; SandsLunchClubMenuOCR/1.0)",
        "Accept": "*/*" if media else "application/rss+xml, application/xml;q=0.9",
    })
    with opener.open(req, timeout=16) as response:
        if not allowed(response.geturl(), media=media):
            raise ValueError("redirected URL is not allowed")
        size = response.headers.get("Content-Length")
        if size and size.isdigit() and int(size) > limit:
            raise ValueError("media limit exceeded")
        result = response.read(limit + 1)
    if not result or len(result) > limit:
        raise ValueError("empty or oversized download")
    return result


class HTMLMedia(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.videos: list[str] = []
        self.images: list[str] = []
        self.text: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        info = dict(attrs)
        if tag in ("script", "style"):
            self.skip += 1
        if tag in ("video", "source"):
            src = info.get("src", "")
            if allowed(src, media=True):
                self.videos.append(src)
        if tag == "img":
            src = info.get("src", "")
            if allowed(src, media=True):
                self.images.append(src)

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip and data.strip():
            self.text.append(data.strip())


def parse_feed(xml_text: str, day: str) -> list[dict]:
    if "<!DOCTYPE" in xml_text.upper() or "<!ENTITY" in xml_text.upper():
        raise ValueError("external entities are not permitted")
    root = ET.fromstring(xml_text)
    items = root.findall(".//item")
    posts = []
    for item in items[:60]:
        post_url = valid_post(html.unescape(item.findtext("link", default="") or ""))
        if not post_url:
            continue
        pub = item.findtext("pubDate", default="") or ""
        try:
            stamp = email.utils.parsedate_to_datetime(pub)
            if stamp.tzinfo is None:
                continue
            local = stamp.astimezone(SEOUL)
        except (ValueError, TypeError, OverflowError):
            continue
        if local.date().isoformat() != day:
            continue
        raw = html.unescape(item.findtext("description", default="") or "")
        caption = HTMLMedia()
        caption.feed(raw[:150_000])
        title = item.findtext("title", default="") or ""
        for media in item.findall(".//{*}content"):
            url = media.get("url", "")
            if not allowed(url, media=True):
                continue
            if (media.get("type", "") or "").startswith("video/"):
                caption.videos.append(url)
            else:
                caption.images.append(url)
        media = (caption.videos[0], "video") if caption.videos else (
            (caption.images[0], "image") if caption.images else (None, None))
        if media[0]:
            posts.append({
                "post_url": post_url,
                "published_at": local.isoformat(timespec="seconds"),
                "media_url": media[0], "kind": media[1],
                "caption": " ".join([title] + caption.text)[:250],
            })
    posts.sort(key=lambda p: p["published_at"], reverse=True)
    return posts[:MAX_POSTS]


def frame_score(text: str) -> dict:
    normalized = unicodedata.normalize("NFKC", text)
    compact = re.sub(r"\s+", "", normalized)
    hangul = len(re.findall(r"[가-힣]", compact))
    promo = bool(PROMOTION_RE.search(compact))
    header = bool(HEADER_RE.search(compact))
    foods = [word for word in FOODS if word in compact]
    lines = [l for l in normalized.splitlines() if len(re.findall(r"[가-힣]", l)) >= 2]
    # An anniversary poster that mentions "menu" or "rice ticket" is not a menu.
    strong = not promo and hangul >= 12 and header and (len(foods) >= 2 or len(lines) >= 4)
    medium = not promo and hangul >= 17 and (
        (header and len(foods) >= 1) or (len(foods) >= 4 and len(lines) >= 4))
    score = (6 if header else 0) + min(7, len(foods)) + (2 if len(lines) >= 4 else 0)
    if promo:
        score -= 20
    return {"strong": strong, "medium": medium, "promo": promo, "score": score}


def frame_verdict(rows: list[dict]) -> dict:
    strong = sum(bool(row["strong"]) for row in rows)
    medium = sum(bool(row["medium"]) for row in rows)
    promo = sum(bool(row["promo"]) for row in rows)
    # Multiple independent video frames must agree. One catchy poster is insufficient.
    verified = strong >= 2 and medium >= 2 and promo == 0
    return {
        "verified": verified,
        "strong_frames": strong,
        "supporting_frames": medium,
        "promotion_frames": promo,
        "sampled_frames": len(rows),
        "score": sum(max(0, min(15, int(r["score"]))) for r in rows if r["medium"]),
    }


def run(cmd: list[str], timeout: int = 18) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=timeout, check=True)


def images_from_video(path: Path, folder: Path) -> list[Path]:
    try:
        info = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                               "-of", "json", str(path)]).stdout)
        duration = float(info["format"]["duration"])
    except (KeyError, ValueError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return []
    if duration <= 0 or duration > MAX_SECONDS:
        return []
    times = [t for t in SAMPLE_SECONDS if t < duration - 0.12]
    near_end = max(.05, duration - .28)
    if not any(abs(t - near_end) < .18 for t in times):
        times.append(near_end)
    times = sorted(set(round(t, 2) for t in times if t < duration))
    if len(times) < 2:
        times = [max(.05, duration * .25), max(.08, duration * .7)]
    frames = []
    for i, sec in enumerate(times[:9]):
        file = folder / f"frame_{i}.png"
        try:
            run(["ffmpeg", "-nostdin", "-loglevel", "error", "-ss", str(sec),
                 "-i", str(path), "-frames:v", "1", "-vf",
                 "scale=min(max(960\\,iw*2)\\,1440):-2,eq=contrast=1.18:brightness=0.03",
                 "-y", str(file)], timeout=20)
            if file.is_file() and file.stat().st_size > 100:
                frames.append(file)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            continue
    return frames


def inspect_post(post: dict) -> dict:
    result = {"post_url": post["post_url"], "kind": post["kind"],
              "status": "unavailable", "strong_frames": 0,
              "supporting_frames": 0, "promotion_frames": 0, "sampled_frames": 0, "score": 0,
              "reason": "not_processed"}
    try:
        media = download(post["media_url"], media=True, limit=MAX_MEDIA)
        with tempfile.TemporaryDirectory(prefix="gangnam-ocr-") as directory:
            folder = Path(directory)
            ext = "mp4" if post["kind"] == "video" else "img"
            original = folder / ("input." + ext)
            original.write_bytes(media)
            frames = images_from_video(original, folder) if post["kind"] == "video" else [original]
            if not frames:
                result["reason"] = "no_video_frames"
                return result
            scores = []
            for frame in frames:
                try:
                    captured = run(["tesseract", str(frame), "stdout", "-l", "kor+eng",
                                    "--psm", "11"], timeout=18).stdout.decode("utf-8", "replace")
                    first = frame_score(captured)
                    if not first["strong"]:
                        try:
                            additional = run(["tesseract", str(frame), "stdout", "-l", "kor+eng",
                                              "--psm", "6"], timeout=18).stdout.decode("utf-8", "replace")
                            alternative = frame_score(additional)
                            if alternative["strong"] or alternative["score"] > first["score"]:
                                captured, first = additional, alternative
                        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
                            pass
                    if len(scores) < 2:
                        excerpt = re.sub(r"\\s+", " ", captured).strip()[:140]
                        print("OCR sample", len(scores) + 1, "chars", len(captured), "text", repr(excerpt))
                    scores.append(first)
                except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
                    continue
            verdict = frame_verdict(scores)
            if post["kind"] == "image" and len(scores) == 1:
                # A single still image requires exceptionally clear menu evidence.
                verdict["verified"] = bool(scores[0]["strong"] and scores[0]["score"] >= 10)
            result.update({k: v for k, v in verdict.items() if k != "verified"})
            result["status"] = "verified" if verdict["verified"] else "unverified"
            result["reason"] = "ocr_insufficient" if scores and not verdict["verified"] else "ocr_verified" if scores else "no_ocr_text"
    except urllib.error.HTTPError as exc:
        result["reason"] = "media_http_" + str(exc.code)
    except (urllib.error.URLError, OSError, TimeoutError):
        result["reason"] = "media_network_error"
    except ValueError:
        result["reason"] = "invalid_media_or_redirect"
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        result["reason"] = "video_decoder_error"
    return result


def get_posts(day: str) -> tuple[list[dict], bool]:
    for url in FEED_URLS:
        try:
            xml = download(url, media=False, limit=MAX_FEED).decode("utf-8", "replace")
            # A successful feed with no posts today is different from a broken feed.
            posts = parse_feed(xml, day)
            print("RSS response accepted; candidate count:", len(posts))
            return posts, True
        except (ValueError, urllib.error.URLError, OSError, ET.ParseError, TimeoutError):
            continue
    print("RSS sources were not reachable or returned invalid XML")
    return [], False


def choose_results(results: list[dict]) -> tuple[str, str, dict | None]:
    strong = [r for r in results if r["status"] == "verified"]
    strong.sort(key=lambda p: (p["score"], p["strong_frames"]), reverse=True)
    if len(strong) == 1:
        return "verified", strong[0]["post_url"], strong[0]
    if len(strong) > 1:
        if strong[0]["score"] >= strong[1]["score"] + 12 and strong[0]["strong_frames"] >= 2:
            return "verified", strong[0]["post_url"], strong[0]
        return "ambiguous", "", None
    return "unverified", "", None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/gangnam-ocr.json")
    parser.add_argument("--date", help="YYYY-MM-DD, normally current date in Asia/Seoul")
    args = parser.parse_args(argv)
    day = args.date or dt.datetime.now(SEOUL).date().isoformat()
    if not re.fullmatch(r"20\d\d-\d\d-\d\d", day):
        parser.error("invalid date")
    posts, feed_available = get_posts(day)
    results = [inspect_post(p) for p in posts]
    for index, result in enumerate(results, 1):
        print("Candidate", index, "kind", result["kind"], "status", result["status"],
              "frames", result["sampled_frames"], "menu", result["strong_frames"],
              "promo", result["promotion_frames"], "reason", result["reason"])
    status, selected_url, best = choose_results(results)
    if not feed_available:
        status = "unavailable"
    timestamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    out = {
        "version": VERSION, "date": day, "status": status,
        "checked_at": timestamp, "selected_post_url": selected_url,
        "evidence": {
            "menu_frames": best["strong_frames"] if best else 0,
            "sampled_frames": best["sampled_frames"] if best else 0,
            "score": best["score"] if best else 0,
        },
        "candidates_checked": len(results),
        "diagnostics": [
            {"index": i + 1, "kind": result["kind"], "status": result["status"],
             "frames": result["sampled_frames"], "menu_frames": result["strong_frames"],
             "promotion_frames": result["promotion_frames"], "reason": result["reason"]}
            for i, result in enumerate(results)
        ],
    }
    # An earlier same-day verified menu can survive a later transient RSS outage.
    path = Path(args.output)
    if path.is_file():
        try:
            previous = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            previous = {}
        if previous.get("version") == VERSION and previous.get("date") == day:
            prior_ok = previous.get("status") == "verified" and valid_post(previous.get("selected_post_url", ""))
            if prior_ok and status in ("unavailable", "unverified"):
                out = previous
            elif (previous.get("status"), previous.get("selected_post_url")) == (status, selected_url):
                previous_checked = previous.get("checked_at", "")
                try:
                    age = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(previous_checked.replace("Z", "+00:00"))).total_seconds()
                except (ValueError, TypeError):
                    age = 10_000
                if 0 <= age < 90 * 60 and previous.get("diagnostics") == out.get("diagnostics"):
                    out = previous
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Menu video OCR:", out["date"], out["status"], "checked", out["candidates_checked"], "candidates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
