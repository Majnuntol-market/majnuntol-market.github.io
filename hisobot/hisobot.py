#!/usr/bin/env python3
"""Spiskalar hisoboti.

Har kuni 21:00 (Toshkent) GitHub Actions ishga tushiradi:
  1. Telegram botidan kanalga oxirgi hisobotdan beri tashlangan rasmlarni oladi (getUpdates).
  2. Har bir rasmni Google Gemini'ga yuborib, chekdagi yetkazib beruvchi va jami summani o'qitadi.
  3. Kun bo'yicha jamlab, hisobotni o'sha kanalga yuboradi.

Maxfiy sozlamalar (GitHub → Settings → Secrets → Actions):
  TG_BOT_TOKEN   — @BotFather bergan token
  TG_CHANNEL_ID  — kanal ID (-100...); bo'sh bo'lsa, bot admin bo'lgan birinchi kanal olinadi
  GEMINI_API_KEY — aistudio.google.com dan olingan kalit
Ixtiyoriy: GEMINI_MODEL (standart: gemini-2.5-flash), DRY_RUN=1 (kanalga yubormay, faqat chiqaradi).

Holat saqlanmaydi: Telegram o'zi qaysi xabarlar qayta ishlanganini eslab qoladi (offset).
Ishga tushgandan keyin kelgan rasmlar tasdiqlanmaydi — ertangi hisobotga qoladi.
"""
import base64, datetime as dt, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

TZ = dt.timezone(dt.timedelta(hours=5))  # Asia/Tashkent
TG = os.environ.get("TG_API", "https://api.telegram.org")  # sinov uchun almashtirish mumkin
GEM = os.environ.get("GEMINI_API", "https://generativelanguage.googleapis.com/v1beta/models")
MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]


def env(name, default=None, required=False):
    v = os.environ.get(name, default)
    if required and not v:
        sys.exit(f"XATO: {name} sozlanmagan (GitHub Secrets ga qo'shing)")
    return v


def http(method, url, data=None, headers=None, timeout=60, raw=False):
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        headers = dict(headers or {}, **{"Content-Type": "application/json"})
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                return b if raw else json.loads(b)
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:500]
            if e.code in (429, 500, 502, 503, 504) and attempt < 2:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"HTTP {e.code}: {msg}") from None
        except urllib.error.URLError:
            if attempt < 2:
                time.sleep(5)
                continue
            raise


class Telegram:
    def __init__(self, token):
        self.base = f"{TG}/bot{token}"
        self.fbase = f"{TG}/file/bot{token}"

    def call(self, method, **params):
        r = http("POST", f"{self.base}/{method}", params)
        if not r.get("ok"):
            raise RuntimeError(f"Telegram {method}: {r}")
        return r["result"]

    def updates(self):
        out, offset = [], None
        while True:
            p = {"timeout": 0, "limit": 100, "allowed_updates": ["channel_post", "edited_channel_post", "my_chat_member"]}
            if offset is not None:
                p["offset"] = offset
            batch = self.call("getUpdates", **p)
            if not batch:
                return out
            out += batch
            offset = batch[-1]["update_id"] + 1
            if len(batch) < 100:
                return out

    def confirm(self, last_update_id):
        # Shu ID gacha bo'lgan xabarlar qayta ishlandi — Telegram ularni boshqa bermaydi
        self.call("getUpdates", offset=last_update_id + 1, limit=1, timeout=0)

    def download(self, file_id):
        f = self.call("getFile", file_id=file_id)
        return http("GET", f"{self.fbase}/{f['file_path']}", raw=True), f["file_path"]

    def send(self, chat_id, text):
        # Telegram xabari 4096 belgigacha
        parts, cur = [], ""
        for line in text.split("\n"):
            if len(cur) + len(line) + 1 > 3900:
                parts.append(cur)
                cur = ""
            cur += line + "\n"
        parts.append(cur)
        for p in parts:
            if p.strip():
                self.call("sendMessage", chat_id=chat_id, text=p, parse_mode="HTML", disable_web_page_preview=True)


PROMPT = """Bu rasm — do'konga kelgan mahsulot cheki/nakladnoyi/spiskasi (o'zbek yoki rus tilida).
Faqat JSON qaytar, boshqa hech narsa yozma:
{"cheki": true/false,            // bu haqiqatan chek/spiska rasmimi
 "oqildi": true/false,           // jami summani ishonchli o'qiy oldingmi
 "yetkazuvchi": "...",           // firma yoki sotuvchi nomi (tepadagi sarlavha); bo'lmasa ""
 "kimga": "...",                 // mijoz/qabul qiluvchi (masalan "Iqbol aka", "Majnuntol"); bo'lmasa ""
 "sana": "YYYY-MM-DD HH:MM",     // chekdagi sana va vaqt; bo'lmasa ""
 "qatorlar_soni": 0,             // mahsulot qatorlari soni
 "qatorlar_yigindisi": 0,        // har bir qator summasining yig'indisi (so'm, butun son)
 "jami": 0,                      // "Жами сумма"/"Общая сумма"/"Итого" — mahsulotlarning jami qiymati (so'm, butun son)
 "tolangan": 0,                  // "Тўлов"/"Сумма к оплате"/"Оплачено" bo'lsa (so'm), bo'lmasa 0
 "qoldiq": 0,                    // "Қолдиқ сумма"/qarz bo'lsa (so'm), bo'lmasa 0
 "izoh": "..."}                  // muammo bo'lsa qisqa izoh (xira, kesilgan va h.k.), bo'lmasa ""
Muhim holatlar:
- Bosma narxlar ro'yxati bo'lib, miqdorlar va jami QO'LDA (ruchka bilan) yozilgan bo'lsa: "jami" — qo'lda yozilgan
  umumiy summa (odatda pastda katta yozilgan). Qo'lda yozilgan miqdor bor qatorlarni sanab "qatorlar_soni" ga,
  miqdor × narx yig'indisini "qatorlar_yigindisi" ga yoz. Miqdori yozilmagan qatorlarni hisoblama.
- Jami summa yozilmagan bo'lsa, qatorlar yig'indisini "jami" ga yoz va izohga "jami yozilmagan, hisoblandi" deb qo'sh.
- Raqam aniq ko'rinmasa, taxmin qilma: "oqildi": false.
Raqamlardagi bo'shliq va nuqtalarni olib tashla: "1 628 000" → 1628000; "241.500" → 241500."""


def pick_model(key):
    """Google'dagi mavjud modellardan eng yangi tekin "flash" (rasm o'qiy oladigan) modelni tanlaydi."""
    try:
        r = http("GET", f"{GEM}?pageSize=200", headers={"x-goog-api-key": key})
    except Exception as e:
        print(f"Modellar ro'yxatini olib bo'lmadi ({e}), standart model ishlatiladi")
        return "gemini-2.5-flash"
    best = None
    for m in r.get("models", []):
        name = m.get("name", "").split("/")[-1]
        if "generateContent" not in m.get("supportedGenerationMethods", []):
            continue
        if not re.fullmatch(r"gemini-(\d+(?:\.\d+)?)-flash(-lite)?(-\d{3})?", name):
            continue  # preview/exp/tts/live/image modellar kerak emas
        v = float(re.match(r"gemini-(\d+(?:\.\d+)?)", name).group(1))
        score = (v, 0 if "lite" in name else 1)  # bir xil versiyada to'liq flash afzal
        if best is None or score > best[0]:
            best = (score, name)
    return best[1] if best else "gemini-2.5-flash"


def gemini_read(key, model, img, mime):
    url = f"{GEM}/{model}:generateContent"
    data = {
        "contents": [{"parts": [{"text": PROMPT}, {"inline_data": {"mime_type": mime, "data": base64.b64encode(img).decode()}}]}],
        "generationConfig": {"temperature": 0, "response_mime_type": "application/json"},
    }
    r = http("POST", url, data, headers={"x-goog-api-key": key}, timeout=120)
    try:
        txt = r["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Gemini javobi bo'sh: {json.dumps(r)[:300]}")
    txt = re.sub(r"^```(?:json)?|```$", "", txt.strip()).strip()
    return json.loads(txt)


def as_int(v):
    if isinstance(v, (int, float)):
        return int(round(v))
    s = re.sub(r"[^\d]", "", str(v or ""))
    return int(s) if s else 0


def fmt(n):
    return f"{n:,}".replace(",", " ") + " so'm"


def esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def image_of(post):
    """Kanal xabaridan rasm (file_id, mime) — oddiy rasm yoki fayl sifatida yuborilgan rasm."""
    if post.get("photo"):
        return post["photo"][-1]["file_id"], "image/jpeg"
    d = post.get("document") or {}
    if str(d.get("mime_type", "")).startswith("image/"):
        return d["file_id"], d["mime_type"]
    return None


def build_report(day, rows):
    d = dt.date.fromisoformat(day)
    lines = [f"📊 <b>{d.day}-{MONTHS[d.month - 1]} {d.year} — kelgan mahsulotlar</b>", "<i>kecha 21:00 dan bugun 21:00 gacha</i>", ""]
    total = paid = 0
    bad = 0
    n = 0
    for r in rows:
        if not r.get("cheki", True):
            continue
        n += 1
        who = r.get("yetkazuvchi") or r.get("kimga") or "Noma'lum"
        tm = r["vaqt"]
        jami = as_int(r.get("jami"))
        if not r.get("oqildi") or not jami:
            bad += 1
            lines.append(f"{n}. ⚠️ {esc(who)} ({tm}) — <b>o'qib bo'lmadi</b>, qo'lda tekshiring" + (f" · {esc(r.get('izoh'))}" if r.get("izoh") else ""))
            continue
        total += jami
        tp = as_int(r.get("tolangan"))
        paid += tp or jami
        extra = []
        if as_int(r.get("qatorlar_soni")):
            extra.append(f"{as_int(r.get('qatorlar_soni'))} xil")
        if tp and tp != jami:
            extra.append(f"to'langan {fmt(tp)}")
        qy = as_int(r.get("qatorlar_yigindisi"))
        warn = " ⚠️ qatorlar yig'indisi boshqacha: " + fmt(qy) if qy and abs(qy - jami) > max(1000, jami * 0.01) else ""
        lines.append(f"{n}. {esc(who)} ({tm}) — <b>{fmt(jami)}</b>" + (f" ({', '.join(extra)})" if extra else "") + warn)
    if n == 0:
        lines.append("Bu davrda spiska tashlanmadi.")
    else:
        lines += ["", f"💰 <b>Jami: {fmt(total)}</b> · {n} ta spiska"]
        if paid and paid != total:
            lines.append(f"To'langan: {fmt(paid)}")
        if bad:
            lines.append(f"⚠️ {bad} ta rasm o'qilmadi — jamiga qo'shilmagan")
    lines += ["", "<i>Avtomatik hisobot. Xato bo'lsa, rasmni aniqroq qilib qayta tashlang.</i>"]
    return "\n".join(lines)


def main():
    # Nusxalashda qo'shilib qolgan bo'sh joy/yangi qatorlarni tozalaymiz
    raw_tok = re.sub(r"\s+", "", env("TG_BOT_TOKEN", required=True))
    m = re.search(r"\d{5,}:[A-Za-z0-9_-]{30,}", raw_tok)
    if not m:
        t = raw_tok.strip()
        sys.exit("XATO: TG_BOT_TOKEN noto'g'ri ko'rinishda. "
                 f"Uzunligi {len(t)} belgi (odatda 46), ':' {'bor' if ':' in t else 'yo`q'}, "
                 f"ichida bo'sh joy {'bor' if re.search(r'\s', t) else 'yo`q'}, "
                 f"boshi raqam: {'ha' if t[:1].isdigit() else 'yo`q'}")
    tg = Telegram(m.group(0))
    key = re.sub(r"\s+", "", env("GEMINI_API_KEY", required=True))
    model = env("GEMINI_MODEL") or pick_model(key)
    note(f"Gemini modeli: {model}")
    chan = env("TG_CHANNEL_ID") or ""
    dry = env("DRY_RUN", "") == "1"

    now = dt.datetime.now(TZ)
    cutoff = now  # hozirgacha (21:00) tashlanganlar hisoblanadi; keyingilari ertangi hisobotga

    ups = tg.updates()
    note(f"Telegram: {len(ups)} ta yangilanish")
    if not chan:
        for u in ups:
            c = (u.get("channel_post") or u.get("my_chat_member", {})).get("chat", {})
            if c.get("type") == "channel":
                chan = str(c["id"])
                break
        if not chan:
            note("Kanal topilmadi: botni kanalga admin qiling va kanalga bitta xabar tashlang, yoki TG_CHANNEL_ID ni sozlang.", "warning")
            return
    print(f"Kanal: {chan}")

    items, last_done, keep = [], None, False
    for u in ups:
        post = u.get("channel_post") or u.get("edited_channel_post")
        when = dt.datetime.fromtimestamp((post or {}).get("date", 0), TZ) if post else None
        if post and when >= cutoff:
            keep = True  # ishga tushgandan keyin kelgan xabar — ertangi hisobotga qoladi
        if keep:
            continue
        last_done = u["update_id"]
        if not post or str(post["chat"]["id"]) != chan or u.get("edited_channel_post"):
            continue
        img = image_of(post)
        if img:
            items.append((when, post, img))

    day = now.date().isoformat()
    if items:
        rows = []
        for when, post, (fid, mime) in sorted(items, key=lambda x: x[0]):
            # bugungi bo'lsa faqat soat, kechagi bo'lsa sana bilan
            r = {"vaqt": when.strftime("%H:%M") if when.date() == now.date() else when.strftime("%d.%m %H:%M")}
            try:
                data, path = tg.download(fid)
                if mime == "image/jpeg" and path.lower().endswith(".png"):
                    mime = "image/png"
                r.update(gemini_read(key, model, data, mime))
            except Exception as e:  # bitta rasm xatosi butun hisobotni to'xtatmasin
                note(f"Rasm xatosi ({r['vaqt']}): {e}", "warning")
                r.update({"cheki": True, "oqildi": False, "izoh": "rasmni o'qishda xato"})
            print(f"  {r['vaqt']}: {json.dumps(r, ensure_ascii=False)}")
            rows.append(r)
            time.sleep(1)
        text = build_report(day, rows)
        print("\n" + text + "\n")
        note(f"{len(rows)} ta rasm o'qildi; " + " | ".join(f"{r['vaqt']} {as_int(r.get('jami'))}" for r in rows))
        if not dry:
            tg.send(chan, text)
    else:
        print("Bu davrda rasm yo'q — hisobot yuborilmadi")

    if last_done is not None and not dry:
        tg.confirm(last_done)
    print("Tayyor.")


def note(msg, level="notice"):
    """GitHub Actions sahifasida ko'rinadigan qisqa xabar (maxfiy kalitlarsiz)."""
    for secret in (os.environ.get("TG_BOT_TOKEN"), os.environ.get("GEMINI_API_KEY")):
        if secret:
            msg = msg.replace(secret, "***")
    print(f"::{level}::{msg[:900]}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if isinstance(e.code, str):
            note(e.code, "error")
            sys.exit(1)
        raise
    except Exception as e:
        note(f"{type(e).__name__}: {e}", "error")
        sys.exit(1)
