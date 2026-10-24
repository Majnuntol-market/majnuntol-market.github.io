#!/usr/bin/env python3
"""Qayta ishlangan deb belgilanib qolgan kanal rasmlarini qayta olib, hisobotni qayta tuzadi.

Bot kanal tarixini o'qiy olmaydi, lekin xabarni ID bo'yicha forward qila oladi. Shuning uchun:
  1. Navbatdagi (hali tasdiqlanmagan) kanal xabarlaridan kanal ID va eng oxirgi xabar raqamini olamiz.
  2. Kanal egasining (creator) bot bilan shaxsiy chatiga xabarlarni ovozsiz forward qilib, rasmni olamiz
     va forward qilingan nusxani darhol o'chiramiz. Kanalning o'ziga hech narsa yozilmaydi.
  3. Navbatda turgan (ertangi hisobotga qoladigan) xabarlar tashlab o'tiladi — ikki marta hisoblanmaydi.
  4. Rasmlarni o'qib, hisobot tuzamiz. DRY_RUN=1 — faqat natijani ko'rsatadi; aks holda kanallarga yuboradi.

Muhit: TG_BOT_TOKEN, GEMINI_API_KEY, FROM (masalan 2026-10-23T21:00), DRY_RUN, TG_CHANNEL_ID (ixtiyoriy)
"""
import datetime as dt, os, re, sys, time

sys.path.insert(0, os.path.dirname(__file__))
import hisobot as H  # noqa: E402


def main():
    m = re.search(r"\d{5,}:[A-Za-z0-9_-]{30,}", re.sub(r"\s+", "", H.env("TG_BOT_TOKEN", required=True)))
    tg = H.Telegram(m.group(0))
    key = re.sub(r"\s+", "", H.env("GEMINI_API_KEY", required=True))
    dry = H.env("DRY_RUN", "") == "1"
    start = dt.datetime.fromisoformat(H.env("FROM", required=True)).replace(tzinfo=H.TZ)
    now = dt.datetime.now(H.TZ)
    day = H.env("REPORT_DAY") or now.date().isoformat()
    allowed = {c.strip() for c in (H.env("TG_CHANNEL_ID") or "").split(",") if c.strip()}

    # 1) navbat: kanallar, eng katta xabar raqami, hali tasdiqlanmagan (ertaga hisoblanadigan) xabarlar
    ups = tg.updates()
    chans, pending = {}, set()
    for u in ups:
        p = u.get("channel_post") or u.get("edited_channel_post")
        if not p or p["chat"].get("type") != "channel":
            continue
        cid = str(p["chat"]["id"])
        if allowed and cid not in allowed:
            continue
        pending.add((cid, p["message_id"]))
        t, mx = chans.get(cid, (p["chat"].get("title") or cid, 0))
        chans[cid] = (t, max(mx, p["message_id"]))
    H.note(f"Navbatda {len(ups)} ta yangilanish; kanallar: " + ", ".join(f"{t} (oxirgi №{mx})" for t, mx in chans.values()))
    if not chans:
        sys.exit("Kanal topilmadi: har bir kanalga bitta qisqa xabar tashlang (masalan «.»)")

    models = H.pick_models(key)
    H.note(f"Gemini modellari: {', '.join(models[:4])}")

    reports, failed_total = [], 0
    for cid, (title, mx) in chans.items():
        owner = next((a["user"]["id"] for a in tg.call("getChatAdministrators", chat_id=cid) if a["status"] == "creator"), None)
        if not owner:
            sys.exit(f"{title}: kanal egasi topilmadi")
        items, misses, older = [], 0, 0
        for mid in range(mx, max(0, mx - 600), -1):
            if (cid, mid) in pending:
                continue  # ertangi hisobotga qoladi
            try:
                fw = tg.call("forwardMessage", chat_id=owner, from_chat_id=cid, message_id=mid, disable_notification=True)
            except Exception as e:
                if "message to forward not found" in str(e) or "MESSAGE_ID_INVALID" in str(e) or "HTTP 400" in str(e):
                    misses += 1
                    if misses > 80:
                        break
                    continue
                raise
            misses = 0
            try:
                tg.call("deleteMessage", chat_id=owner, message_id=fw["message_id"])
            except Exception:
                pass
            orig = (fw.get("forward_origin") or {}).get("date") or fw.get("forward_date") or fw.get("date")
            when = dt.datetime.fromtimestamp(orig, H.TZ)
            if when < start:
                older += 1
                if older >= 5:
                    break  # davr boshidan oldingi xabarlarga yetdik
                continue
            img = H.image_of(fw)
            if img:
                items.append((when, img))
            time.sleep(0.1)
        H.note(f"{title}: {len(items)} ta rasm topildi ({start:%d.%m %H:%M} dan)")
        rows, f = H.read_items(tg, key, models, items, now, title)
        failed_total += f
        reports.append((cid, title, H.build_report(day, rows), rows))
        H.note(f"{title}: xato {f}; " + " | ".join(f"{r['vaqt']} {H.as_int(r.get('jami'))}" for r in rows))
        total = sum(H.as_int(r.get("jami")) for r in rows if r.get("oqildi") and r.get("cheki") is not False)
        bad = sum(1 for r in rows if not r.get("oqildi") and r.get("cheki") is not False)
        H.note(f"{title}: JAMI {total:,} so'm, o'qilmagan {bad}".replace(",", " "))

    if failed_total:
        sys.exit(f"{failed_total} ta rasm texnik sabab bilan o'qilmadi — hisobot yuborilmadi")
    for cid, title, text, rows in reports:
        print(f"\n[{title}]\n{text}\n", flush=True)
        if not dry:
            tg.send(cid, text)
            H.note(f"{title}: hisobot yuborildi")
    if not dry:
        H.state_put({"sent": day})


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if isinstance(e.code, str):
            H.note(e.code, "error")
            sys.exit(1)
        raise
    except Exception as e:
        H.note(f"{type(e).__name__}: {e}", "error")
        sys.exit(1)
