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
import base64, datetime as dt, hashlib, hmac, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

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
            if e.code in (500, 502, 503, 504) and attempt < 1:
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


def pick_models(key):
    """Google'dagi mavjud tekin "flash" modellar: eng yangisi birinchi, bir versiyada to'liq flash lite'dan oldin.
    Har bir modelning limiti alohida — biri tugasa keyingisiga o'tamiz."""
    try:
        r = http("GET", f"{GEM}?pageSize=200", headers={"x-goog-api-key": key})
    except Exception as e:
        note(f"Modellar ro'yxatini olib bo'lmadi ({e})", "warning")
        return ["gemini-2.5-flash"]
    found = []
    for m in r.get("models", []):
        name = m.get("name", "").split("/")[-1]
        if "generateContent" not in m.get("supportedGenerationMethods", []):
            continue
        if not re.fullmatch(r"gemini-(\d+(?:\.\d+)?)-flash(-lite)?", name):
            continue  # preview/exp/tts/live/image modellar kerak emas
        v = float(re.match(r"gemini-(\d+(?:\.\d+)?)", name).group(1))
        found.append(((v, 0 if "lite" in name else 1), name))
    found.sort(reverse=True)
    return [n for _, n in found] or ["gemini-2.5-flash"]


def gemini_read(key, model, img, mime):
    url = f"{GEM}/{model}:generateContent"
    data = {
        "contents": [{"parts": [{"text": PROMPT}, {"inline_data": {"mime_type": mime, "data": base64.b64encode(img).decode()}}]}],
        "generationConfig": {"temperature": 0, "response_mime_type": "application/json"},
    }
    r = http("POST", url, data, headers={"x-goog-api-key": key}, timeout=90)
    try:
        txt = r["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Gemini javobi bo'sh: {json.dumps(r)[:300]}")
    txt = re.sub(r"^```(?:json)?|```$", "", txt.strip()).strip()
    return json.loads(txt)


DEADLINE = time.time() + 35 * 60  # undan keyin qolgan rasmlar o'qilmaydi — hisobot yuborilmaydi
MIN_GAP = 7.0                      # so'rovlar orasida kamida 7 soniya (tekin tarif: daqiqasiga ~10 ta)
_dead_models = set()               # kunlik limiti tugagan yoki mavjud bo'lmagan modellar
_last_call = [0.0]


class ReadFailed(Exception):
    """Rasmni texnik sabab bilan o'qib bo'lmadi (limit, tarmoq) — hisobot yuborilmaydi, keyin qayta urinamiz."""


def read_with_retry(key, models, img, mime):
    """Daqiqalik limitda Google aytgan vaqtcha kutadi; kunlik limit tugasa keyingi modelga o'tadi."""
    last = "model yo'q"
    for m in models:
        if m in _dead_models:
            continue
        for attempt in range(6):
            if time.time() > DEADLINE:
                raise ReadFailed("vaqt tugadi")
            wait = _last_call[0] + MIN_GAP - time.time()
            if wait > 0:
                time.sleep(wait)
            _last_call[0] = time.time()
            try:
                return gemini_read(key, m, img, mime), m
            except Exception as e:
                last = msg = str(e)
                if "HTTP 404" in msg:
                    _dead_models.add(m)
                    break
                if "HTTP 429" in msg or "RESOURCE_EXHAUSTED" in msg:
                    if re.search(r"PerDay|per day|daily", msg, re.I):
                        _dead_models.add(m)
                        note(f"{m}: kunlik limit tugadi, keyingi modelga o'tiladi", "warning")
                        break
                    d = re.search(r'"retryDelay":\s*"(\d+)', msg)
                    time.sleep(min(70, int(d.group(1)) + 2) if d else 35)
                    continue
                if re.search(r"HTTP 4\d\d", msg):
                    raise ReadFailed(msg[:200])  # kalit yoki so'rov xatosi
                time.sleep(10)  # 5xx, vaqt tugashi, tarmoq
        else:
            break  # 6 urinish ham bo'lmadi — keyingi modelga emas, xato
    raise ReadFailed(last[:200])


def read_items(tg, key, models, items, now, label, cache=None):
    """items: (vaqt, (file_id, mime), kesh_kaliti). Kesh: bir rasm ikki marta o'qilmaydi.
    Qaytaradi: rows, texnik xatolar soni."""
    rows, failed = [], 0
    for when, (fid, mime), ckey in sorted(items, key=lambda x: x[0]):
        r = {"vaqt": when.strftime("%H:%M") if when.date() == now.date() else when.strftime("%d.%m %H:%M")}
        hit = (cache or {}).get(ckey) if ckey else None
        if hit and hit.get("row"):
            r.update(hit["row"])
            r["_kesh"] = 1
        else:
            try:
                data, path = tg.download(fid)
                if mime == "image/jpeg" and path.lower().endswith(".png"):
                    mime = "image/png"
                res, used = read_with_retry(key, models, data, mime)
                r.update(res)
                r["_model"] = used
                if cache is not None and ckey:
                    cache[ckey] = {"ts": int(time.time()), "row": {k: v for k, v in res.items()}}
            except Exception as e:
                failed += 1
                note(f"Rasm o'qilmadi ({label} {r['vaqt']}): {e}", "warning")
                r.update({"cheki": True, "oqildi": False, "izoh": "texnik xato"})
        rows.append(r)
    return rows, failed


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
        if r.get("cheki") is False:
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
    models = [env("GEMINI_MODEL")] if env("GEMINI_MODEL") else pick_models(key)
    note(f"Gemini modellari: {', '.join(models[:4])}")
    # Bir nechta kanal: TG_CHANNEL_ID da vergul bilan, yoki bo'sh bo'lsa — bot admin bo'lgan hamma kanallar
    allowed = {c.strip() for c in (env("TG_CHANNEL_ID") or "").split(",") if c.strip()}
    dry = env("DRY_RUN", "") == "1"
    clear_only = env("CLEAR_ONLY", "") == "1"  # navbatni tozalash: hisobot yubormaydi
    scheduled = env("GITHUB_EVENT_NAME", "") == "schedule"

    now = dt.datetime.now(TZ)
    day = now.date().isoformat()
    at21 = now.replace(hour=21, minute=0, second=0, microsecond=0)
    cutoff = at21 if now >= at21 else now  # 21:00 dan keyingilari ertangi hisobotga

    # Zaxira jadvallar (22:00, 23:00): bugungi hisobot allaqachon yuborilgan bo'lsa — hech narsa qilmaymiz
    if scheduled and state_get().get("sent") == day:
        note("Bugungi hisobot allaqachon yuborilgan")
        return

    ups = tg.updates()
    note(f"Telegram: {len(ups)} ta yangilanish")

    by_chan, titles, last_done, keep = {}, {}, None, False
    for u in ups:
        post = u.get("channel_post") or u.get("edited_channel_post")
        when = dt.datetime.fromtimestamp((post or {}).get("date", 0), TZ) if post else None
        if post and when >= cutoff:
            keep = True  # 21:00 dan keyin kelgan xabar — ertangi hisobotga qoladi
        if keep:
            continue
        last_done = u["update_id"]
        if not post or u.get("edited_channel_post") or post["chat"].get("type") != "channel":
            continue
        cid = str(post["chat"]["id"])
        if allowed and cid not in allowed:
            continue
        titles[cid] = post["chat"].get("title") or cid
        img = image_of(post)
        if img:
            by_chan.setdefault(cid, []).append((when, img, f"{cid}:{post['message_id']}"))

    if clear_only:
        note(f"Navbat tozalandi: {sum(len(v) for v in by_chan.values())} ta rasm hisobotsiz o'tkazib yuborildi")
        if last_done is not None:
            tg.confirm(last_done)
        return

    if not by_chan:
        note("Bu davrda rasm yo'q — hisobot yuborilmadi")
    reports, failed = [], 0
    cache = cache_load()
    for cid, items in by_chan.items():
        rows, f = read_items(tg, key, models, items, now, titles[cid], cache)
        failed += f
        reports.append((cid, build_report(day, rows)))
        note(f"{titles[cid]}: {len(rows)} ta rasm, xato {f}")

    cache_save(cache)
    if failed:
        # Hech narsa yubormaymiz va tasdiqlamaymiz: rasmlar navbatda qoladi, keyingi urinishda qayta o'qiladi
        note(f"{failed} ta rasm texnik sabab bilan o'qilmadi — hisobot YUBORILMADI, keyinroq qayta urinadi", "error")
        sys.exit(1)

    for cid, text in reports:
        if not dry:
            tg.send(cid, text)
    if not dry:
        if last_done is not None:
            tg.confirm(last_done)
        if reports:
            state_put({"sent": day})
    print("Tayyor.")


def _gh(method, path, data=None):
    tok = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not tok or not repo:
        return None
    return http(method, f"https://api.github.com/repos/{repo}/{path}", data,
                headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"})


def state_get():
    """Oxirgi yuborilgan hisobot sanasi ("holat" branch'idagi hisobot-holat.json)."""
    try:
        r = _gh("GET", "contents/hisobot-holat.json?ref=holat")
        return json.loads(base64.b64decode(r["content"])) if r else {}
    except Exception:
        return {}


def state_put(st):
    try:
        try:
            sha = _gh("GET", "contents/hisobot-holat.json?ref=holat")["sha"]
        except Exception:
            sha = None
            try:  # branch yo'q bo'lsa — main'dan yaratamiz
                main_sha = _gh("GET", "git/ref/heads/main")["object"]["sha"]
                _gh("POST", "git/refs", {"ref": "refs/heads/holat", "sha": main_sha})
            except Exception:
                pass
        body = {"message": f"hisobot holati: {st}", "branch": "holat",
                "content": base64.b64encode(json.dumps(st).encode()).decode()}
        if sha:
            body["sha"] = sha
        _gh("PUT", "contents/hisobot-holat.json", body)
    except Exception as e:
        note(f"Holatni saqlab bo'lmadi: {e}", "warning")


def _keystream(k, nonce, n):
    out, c = b"", 0
    while len(out) < n:
        out += hashlib.sha256(k + nonce + c.to_bytes(8, "big")).digest()
        c += 1
    return out[:n]


def _ckey():
    tok = re.sub(r"\s+", "", os.environ.get("TG_BOT_TOKEN", ""))
    return hashlib.sha256(b"hisobot-kesh:" + tok.encode()).digest()


def cache_load():
    """O'qilgan rasmlar natijasi ("holat" branch'ida, bot tokeni asosidagi kalit bilan shifrlangan)."""
    try:
        r = _gh("GET", "contents/hisobot-kesh.bin?ref=holat")
        blob = base64.b64decode(base64.b64decode(r["content"]))
        nonce, ct = blob[:16], blob[16:]
        mac, ct = ct[:32], ct[32:]
        if hmac.new(_ckey(), nonce + ct, hashlib.sha256).digest() != mac:
            return {}
        pt = bytes(a ^ b for a, b in zip(ct, _keystream(_ckey(), nonce, len(ct))))
        data = json.loads(pt)
        old = time.time() - 4 * 86400
        return {k: v for k, v in data.items() if v.get("ts", 0) > old}
    except Exception:
        return {}


def cache_save(cache):
    try:
        pt = json.dumps(cache, ensure_ascii=False).encode()
        nonce = os.urandom(16)
        ct = bytes(a ^ b for a, b in zip(pt, _keystream(_ckey(), nonce, len(pt))))
        mac = hmac.new(_ckey(), nonce + ct, hashlib.sha256).digest()
        blob = base64.b64encode(nonce + mac + ct).decode()
        try:
            sha = _gh("GET", "contents/hisobot-kesh.bin?ref=holat")["sha"]
        except Exception:
            sha = None
        body = {"message": "hisobot keshi", "branch": "holat", "content": base64.b64encode(blob.encode()).decode()}
        if sha:
            body["sha"] = sha
        _gh("PUT", "contents/hisobot-kesh.bin", body)
    except Exception as e:
        note(f"Keshni saqlab bo'lmadi: {e}", "warning")


def note(msg, level="notice"):
    """GitHub Actions sahifasida ko'rinadigan qisqa xabar (maxfiy kalitlarsiz)."""
    for secret in (os.environ.get("TG_BOT_TOKEN"), os.environ.get("GEMINI_API_KEY")):
        secret = re.sub(r"\s+", "", secret or "")
        if len(secret) >= 12:
            msg = msg.replace(secret, "***")
    print(f"::{level}::{msg[:900]}", flush=True)


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
