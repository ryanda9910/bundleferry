#!/usr/bin/env python3
"""Post the bundleferry v0.4.0 carousel to Threads.

Threads needs PUBLIC image urls, so the slides are served from raw.githubusercontent.
Flow (same as lumera-sim-worker/tools/recap_post.py, which is known to work):
  1. create each slide as media_type=IMAGE + is_carousel_item=true, poll until FINISHED
  2. create a media_type=CAROUSEL container with children=<ids>
  3. publish the container

  --dry  print the caption + slide urls, post nothing.
"""
import json
import os
import pathlib
import sys
import time
import urllib.parse
import urllib.request

REPO = "https://github.com/ryanda9910/bundleferry"
RAW = "https://raw.githubusercontent.com/ryanda9910/bundleferry/main/assets/carousel"
CARDS = [f"{RAW}/slide-{i}.png" for i in range(1, 6)]

# Threads is plain text. No markdown, no em dashes. Hard cap: 500 chars
# ("Param text must be at most 500 characters long"), so the slides carry the detail.
CAPTION = """Aku mau bikin bundler sendiri yang lebih cepat dari semua bundler JS. Lalu aku ukur dulu: build Vite di repo nyata cuma 510ms. Kalau bundler-ku 2x lebih cepat, hematnya 255 milidetik.

Kubatalkan. Kubangun advisor yang tidak bisa mengarang angka.

Kubuktikan dengan merusak verifier-ku sendiri supaya menerima semua halusinasi. Tepat 7 tes gagal, persis ketujuh penjaganya.

Bug yang ketangkap: bun punya 2 advisory, tapi tak ada di map. Tool-ku diam saja.

github.com/ryanda9910/bundleferry"""

ALT = [
    "Slide 1: judul 'Aku mau bikin bundler sendiri. Batal.' dengan 'bikin bundler' dicoret merah. Build Vite di repo nyata 510ms, jadi bundler 2x lebih cepat cuma hemat 255ms.",
    "Slide 2: 'Advisor yang tak bisa mengarang angka.' Terminal menampilkan bundleferry --advise dengan baris hijau Scorecard 6.8/10 dan baris merah UNVERIFIED, do not act on this.",
    "Slide 3: 'Kurusak sendiri verifier-nya.' Angka 7 besar berwarna merah, tepat tujuh tes gagal, persis ketujuh penjaga gerbangnya.",
    "Slide 4: 'OSV tanpa versi bohong halus.' Angka 55 merah berubah jadi 25 hijau setelah versi di-pin.",
    "Slide 5: 'Cek keamanan yang diam-diam tak jalan.' bun punya 2 advisory, @rspack/core punya 1, keduanya tak ada di map sehingga tool diam saja.",
]

TB = "https://graph.threads.net/v1.0"
UA = {"User-Agent": "bundleferry-carousel/1.0"}


def xenv() -> dict:
    """Load env from the usual hermes/.env locations without printing secrets."""
    env = dict(os.environ)
    for p in (".env", str(pathlib.Path.home() / ".hermes/.env")):
        f = pathlib.Path(p)
        if not f.exists():
            continue
        for line in f.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env.setdefault(k.strip(), v.strip().strip("'\""))
    return env


def post(url: str, data: dict) -> dict:
    req = urllib.request.Request(
        url, data=urllib.parse.urlencode(data).encode(), headers=UA, method="POST"
    )
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def get(url: str) -> dict:
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read())


MAX_TEXT = 500  # Threads: "Param text must be at most 500 characters long."


def main() -> int:
    dry = "--dry" in sys.argv
    if len(CAPTION) > MAX_TEXT:
        print(f"caption is {len(CAPTION)} chars, Threads caps text at {MAX_TEXT}", file=sys.stderr)
        return 2
    print(f"caption: {len(CAPTION)} chars\n")
    print(CAPTION)
    print("\nslides:")
    for u in CARDS:
        print(" ", u)

    if dry:
        print("\n[dry] not posting.")
        return 0

    e = xenv()
    token = e.get("THREADS_ACCESS_TOKEN")
    uid = e.get("THREADS_USER_ID") or "27310913968557516"
    if not token:
        print("\nTHREADS_ACCESS_TOKEN missing", file=sys.stderr)
        return 2

    kids = []
    for i, cu in enumerate(CARDS):
        c = post(f"{TB}/{uid}/threads", {
            "media_type": "IMAGE", "image_url": cu,
            "is_carousel_item": "true", "alt_text": ALT[i],
            "access_token": token,
        })
        cid = c.get("id")
        if not cid:
            print(f"child {i+1} failed: {c}", file=sys.stderr)
            return 1
        for _ in range(12):
            st = get(f"{TB}/{cid}?fields=status&access_token={token}")
            if st.get("status") == "FINISHED":
                break
            if st.get("status") == "ERROR":
                print(f"child {i+1} ERROR: {st}", file=sys.stderr)
                return 1
            time.sleep(3)
        kids.append(cid)
        print(f"  slide {i+1} ready ({cid})")

    cont = post(f"{TB}/{uid}/threads", {
        "media_type": "CAROUSEL", "children": ",".join(kids),
        "text": CAPTION, "access_token": token,
    })
    time.sleep(5)
    pub = post(f"{TB}/{uid}/threads_publish", {"creation_id": cont["id"], "access_token": token})
    print(f"\nposted: {pub}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
