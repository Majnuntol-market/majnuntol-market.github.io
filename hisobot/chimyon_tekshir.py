#!/usr/bin/env python3
"""ChimyonSuvBot qayerga ulanganini aniqlaydi (faqat o'qiydi, hech narsani o'zgartirmaydi).

Telegram'dan so'raydi: getMe (bot nomi) va getWebhookInfo (xabarlar qaysi serverga boradi).
Natija GitHub Actions sahifasida ko'rinadi; token yashiriladi.
"""
import json, os, re, sys, urllib.error, urllib.parse, urllib.request

raw = re.sub(r"\s+", "", os.environ.get("CHIMYON_BOT_TOKEN", ""))
m = re.search(r"\d{5,}:[A-Za-z0-9_-]{30,}", raw)
if not m:
    print("::error::CHIMYON_BOT_TOKEN sozlanmagan yoki noto'g'ri")
    sys.exit(1)
tok = m.group(0)


def call(method):
    try:
        with urllib.request.urlopen(f"https://api.telegram.org/bot{tok}/{method}", timeout=30) as r:
            return json.loads(r.read())["result"]
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:300]
        hint = " — token eskirgan yoki noto'g'ri nusxalangan (eng oxirgi /revoke tokenini qo'ying)" if e.code == 401 else ""
        print(f"::error::Telegram {method}: HTTP {e.code} {body}{hint}".replace(tok, "***"))
        print(f"::notice::Token boshi: {tok.split(':')[0]}, uzunligi {len(tok)}")
        sys.exit(1)


def note(msg, level="notice"):
    print(f"::{level}::{msg.replace(tok, '***')[:900]}")


me = call("getMe")
note(f"Bot: @{me.get('username')} ({me.get('first_name')})")
w = call("getWebhookInfo")
url = w.get("url") or ""
if url:
    p = urllib.parse.urlsplit(url)
    # yo'l ichida token bo'lishi mumkin — faqat server nomi va yo'lning boshini ko'rsatamiz
    path = re.sub(r"\d{5,}:[A-Za-z0-9_-]{30,}", "***", p.path)[:60]
    note(f"Webhook: {p.scheme}://{p.hostname}{path}")
    note(f"Kutayotgan xabarlar: {w.get('pending_update_count')}; oxirgi xato: {w.get('last_error_message') or 'yo`q'}")
else:
    note(f"Webhook yo'q (bot getUpdates bilan ishlagan yoki faqat xabar yuborgan). Kutayotgan xabarlar: {w.get('pending_update_count')}")
