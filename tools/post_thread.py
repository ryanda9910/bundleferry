#!/usr/bin/env python3
"""Post the bundleferry v0.4.0 story as a 5-beat thread on X and/or Bluesky.

One beat per carousel slide, in English:
  1. killed the custom-bundler idea (510ms)
  2. built an advisor that cannot invent a number
  3. mutation proof (7 tests)
  4. OSV over-claim (55 -> 25)
  5. the silent-skip bug + link

  python3 post_thread.py --dry              print all beats + byte/char counts
  python3 post_thread.py --bluesky          post the Bluesky thread
  python3 post_thread.py --x                post the X thread
  python3 post_thread.py --bluesky --x      post both

Reuses oss-30/distribute/x_post.post_tweet(reply_to=...) for X threading.
Bluesky replies chain via root+parent strong refs (uri+cid).
"""
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path.home() / "project/oss-30/distribute"))

LINK = "github.com/ryanda9910/bundleferry"

# X: <=280 chars per tweet. Bluesky: <=300 bytes per post.
X_BEATS = [
    "I was going to build a JS bundler faster than every other one.\n\nThen I measured. A real Vite build is 510ms. If mine were 2x faster, that saves 255ms.\n\nBundler speed isn't the bottleneck. So I killed the idea. \U0001F9F5",
    "Instead I built an advisor that cannot invent a number.\n\nEvery claim carries provenance. An independent verifier re-checks it against the real API (Scorecard, OSV). A claim asserting a score the source never returned is rejected and printed UNVERIFIED.",
    "I didn't just claim the gate works.\n\nI broke my own verifier so it accepted every hallucinated claim, then ran the tests. Exactly 7 failed. The 7 that guard the gate.\n\nA harness that can't fail proves nothing.",
    "One honest catch: OSV without a version lies quietly.\n\nAsk about `next` with no version, it returns all 55 advisories ever filed, most long fixed. Pin the declared version and it's the 25 that actually apply.",
    "A bug in my own code: bun has 2 advisories, @rspack/core has 1. Both missing from the map, so the tool stayed silent. A Bun project got reported clean when it wasn't.\n\nA security check that quietly doesn't run is the worst kind.\n\n" + LINK,
]

BSKY_BEATS = [
    "I was going to build a JS bundler faster than every other one.\n\nThen I measured. A real Vite build is 510ms. If mine were magically 2x faster, that saves 255 milliseconds.\n\nBundler speed isn't the bottleneck. So I killed the idea.",
    "Instead I built an advisor that cannot invent a number.\n\nEvery claim carries provenance. An independent verifier re-checks it against the real API (OpenSSF Scorecard, OSV). A claim asserting a score the source never returned gets rejected and printed as UNVERIFIED.",
    "I didn't just claim the gate works. I broke my own verifier so it accepted every hallucinated claim, then ran the tests.\n\nExactly 7 failed. The 7 that guard the gate.\n\nA harness that can't fail proves nothing.",
    "One honest catch: OSV without a version lies quietly.\n\nAsk about `next` with no version and it returns all 55 advisories ever filed, most long fixed. Pin the declared version and it's the 25 that actually apply.",
    "And a bug in my own code: bun has 2 advisories, @rspack/core has 1. Both were missing from the map, so the tool stayed silent. A Bun project got reported as clean when it wasn't.\n\nA security check that quietly doesn't run is the worst kind.\n\n" + LINK,
]

PDS = "https://bsky.social"
UA = {"User-Agent": "bundleferry-thread/1.0"}


def xenv() -> dict:
    env = dict(os.environ)
    for p in (".env", str(pathlib.Path.home() / ".hermes/.env")):
        f = pathlib.Path(p)
        if not f.exists():
            continue
        for line in f.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip().strip("'\""))
    return env


def check() -> bool:
    ok = True
    print("=== X beats (cap 280 chars) ===")
    for i, b in enumerate(X_BEATS, 1):
        n = len(b)
        m = "" if n <= 280 else "  OVER"
        ok = ok and n <= 280
        print(f"  {i}/5  {n} chars{m}")
    print("=== Bluesky beats (cap 300 bytes) ===")
    for i, b in enumerate(BSKY_BEATS, 1):
        n = len(b.encode())
        m = "" if n <= 300 else "  OVER"
        ok = ok and n <= 300
        print(f"  {i}/5  {n} bytes{m}")
    for b in X_BEATS + BSKY_BEATS:
        if "—" in b or "–" in b:
            print("  DASH FOUND"); ok = False
    return ok


def post_x(e: dict) -> None:
    import x_post  # from oss-30/distribute
    prev = None
    first = None
    for i, b in enumerate(X_BEATS, 1):
        out = x_post.post_tweet(b, e, reply_to=prev)
        tid = (out.get("data") or {}).get("id")
        if not tid:
            print(f"  X beat {i} FAILED: {out}", file=sys.stderr)
            return
        first = first or tid
        prev = tid
        print(f"  X {i}/5 -> {tid}")
        time.sleep(2)
    print(f"\nX thread: https://x.com/i/status/{first}")


def bsky_req(path, data, token=None):
    headers = dict(UA)
    headers["content-type"] = "application/json"
    if token:
        headers["authorization"] = f"Bearer {token}"
    r = urllib.request.Request(f"{PDS}/xrpc/{path}", data=json.dumps(data).encode(), headers=headers, method="POST")
    return json.loads(urllib.request.urlopen(r, timeout=60).read())


def post_bluesky(e: dict) -> None:
    handle, pw = e.get("BSKY_HANDLE"), e.get("BSKY_APP_PASSWORD")
    sj = bsky_req("com.atproto.server.createSession", {"identifier": handle, "password": pw})
    jwt, did = sj["accessJwt"], sj["did"]

    root = None   # {"uri","cid"} of beat 1
    parent = None # {"uri","cid"} of the previous beat
    for i, b in enumerate(BSKY_BEATS, 1):
        # link facet on the trailing repo URL when present
        facets = []
        idx = b.find(LINK)
        if idx >= 0:
            start = len(b[:idx].encode())
            end = start + len(LINK.encode())
            facets = [{"index": {"byteStart": start, "byteEnd": end},
                       "features": [{"$type": "app.bsky.richtext.facet#link", "uri": f"https://{LINK}"}]}]
        rec = {
            "$type": "app.bsky.feed.post",
            "text": b,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "langs": ["en"],
        }
        if facets:
            rec["facets"] = facets
        if root and parent:
            rec["reply"] = {"root": root, "parent": parent}
        out = bsky_req("com.atproto.repo.createRecord", {"repo": did, "collection": "app.bsky.feed.post", "record": rec}, token=jwt)
        ref = {"uri": out["uri"], "cid": out["cid"]}
        if root is None:
            root = ref
        parent = ref
        print(f"  Bluesky {i}/5 -> {out['uri'].rsplit('/',1)[-1]}")
        time.sleep(1)
    rkey = root["uri"].rsplit("/", 1)[-1]
    print(f"\nBluesky thread: https://bsky.app/profile/{handle}/post/{rkey}")


def main() -> int:
    if not check():
        print("\nsome beat exceeds its limit or has a dash", file=sys.stderr)
        return 2
    if "--dry" in sys.argv or ("--x" not in sys.argv and "--bluesky" not in sys.argv):
        print("\n[dry] pass --x and/or --bluesky to post.")
        return 0
    e = xenv()
    if "--bluesky" in sys.argv:
        print("\nposting Bluesky thread...")
        post_bluesky(e)
    if "--x" in sys.argv:
        print("\nposting X thread...")
        post_x(e)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
