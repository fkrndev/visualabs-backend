import requests
import os
import re
from datetime import datetime, timedelta
from collections import defaultdict

META_TOKEN = os.environ["META_ACCESS_TOKEN"]
AD_ACCOUNT_IDS = os.environ["META_AD_ACCOUNT_IDS"].split(",")
TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
TELEGRAM_CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]

# Akun yang punya grup Telegram tambahan
# Format: account_id → extra chat_id
EXTRA_TELEGRAM_TARGETS = {
    "act_535276971962217": "-5177350356",    # akun 10 VA → grup khusus
    "act_507418894944981": "-1003458910888", # Kuliah Di Jordan → grup khusus
}

# Akun yang perlu Purchase Metrics
PURCHASE_METRICS_ACCOUNTS = {
    "act_1566552664103924",  # KANTOR MJO-1641
    "act_362462733192838",   # KANTOR MJO-1416
}

THRESHOLD_CRITICAL = 100_000
THRESHOLD_WARNING  = 1_000_000
WIB_OFFSET = timedelta(hours=7)

CREDIT_LINE_ACCOUNTS = {
    "act_1566552664103924",
    "act_650212397686303",
    # act_535276971962217 dikeluarkan — Kartu Kredit tanpa spend_cap, pakai balance
    "act_1283148329462351",
    "act_907928660840622",
    "act_362462733192838",
    "act_1086862966036083",  # akun baru Credit Line
}

# Postpaid accounts — sistem bayar tagihan otomatis ke kartu
# Format: account_id → billing_threshold (dalam Rupiah)
POSTPAID_ACCOUNTS = {
    "act_535276971962217": 4_527_250,  # akun 10 VA — Visa *2557
}

# Hardcode result per akun
# Format: (action_type, emoji, label)
# "instagram_profile_visit" → fallback ke link_click HANYA jika tidak ada result lain
ACCOUNT_RESULTS = {
    "act_1566552664103924": [  # KANTOR MJO-1641
        ("offsite_conversion.fb_pixel_complete_registration", "📝", "Website Completed Registration"),
        ("offsite_conversion.fb_pixel_subscribe",             "🔔", "Website Subscribes"),
        ("instagram_profile_visit",                           "📸", "Instagram Profile Visits"),
    ],
    "act_650212397686303": [  # KomAds WL 18
        ("omni_purchase",                        "🛒", "Purchases with Shared Items"),
        ("offsite_conversion.fb_pixel_purchase", "🛒", "Purchases with Shared Items"),
    ],
    "act_535276971962217": [  # Akun 10 VA
        ("lead",                             "📋", "Leads"),
        ("offsite_conversion.fb_pixel_lead", "📋", "Leads"),
        ("instagram_profile_visit",          "📸", "Instagram Profile Visits"),
    ],
    "act_1283148329462351": [  # WL 358 H Barilie Batik
        ("onsite_conversion.messaging_conversation_started_7d", "💬", "Messaging Conversations Started"),
        ("offsite_conversion.fb_pixel_purchase",                "🛒", "Website Purchase"),
        ("instagram_profile_visit",                             "📸", "Instagram Profile Visits"),
    ],
    "act_907928660840622": [  # KomAds WL 534 Ghufran
        ("onsite_conversion.messaging_conversation_started_7d", "💬", "Messaging Conversations Started"),
        ("instagram_profile_visit",                             "📸", "Instagram Profile Visits"),
    ],
    "act_362462733192838": [  # KANTOR MJO-1416
        ("offsite_conversion.fb_pixel_complete_registration", "📝", "Website Completed Registration"),
        ("offsite_conversion.fb_pixel_subscribe",             "🔔", "Website Subscribes"),
        ("instagram_profile_visit",                           "📸", "Instagram Profile Visits"),
    ],
    "act_507418894944981": [  # Kuliah Di Jordan
        ("onsite_conversion.messaging_conversation_started_7d", "💬", "Messaging Conversations Started"),
        ("instagram_profile_visit",                             "📸", "Instagram Profile Visits"),
    ],
    "act_684505151076514": [  # CPAS Putra Mandiri
        ("omni_purchase",                        "🛒", "Purchases with Shared Items"),
        ("offsite_conversion.fb_pixel_purchase", "🛒", "Purchases with Shared Items"),
    ],
    "act_573157931634845": [  # sit_laatahzancitra
        ("instagram_profile_visit", "📸", "Instagram Profile Visits"),
    ],
    "act_839472674695721": [  # taiba_ads
        ("onsite_conversion.messaging_conversation_started_7d", "💬", "Messaging Conversations Started"),
        ("instagram_profile_visit",                             "📸", "Instagram Profile Visits"),
    ],
    "act_1086862966036083": [  # akun baru Credit Line
        ("onsite_conversion.messaging_conversation_started_7d", "💬", "Messaging Conversations Started"),
        ("instagram_profile_visit",                             "📸", "Instagram Profile Visits"),
    ],
    "act_305604389100190": [  # akun baru Prepaid
        ("omni_purchase",                        "🛒", "Website Purchases"),
        ("offsite_conversion.fb_pixel_purchase", "🛒", "Website Purchases"),
        ("instagram_profile_visit",              "📸", "Instagram Profile Visits"),
    ],
}

# Kata kunci nama campaign Traffic PER AKUN
# Hanya akun yang didaftarkan di sini yang terpengaruh
# Akun lain tidak terpengaruh sama sekali
TRAFFIC_KEYWORDS_PER_ACCOUNT = {
    "act_839472674695721": ["Traffic", "traffic", "TRAFFIC"],  # taiba_ads
    "act_507418894944981": ["Traffic", "traffic", "TRAFFIC"],  # Kuliah Di Jordan
}

# Action aliases — normalisasi action_type yang artinya sama
ACTION_ALIASES = {
    "complete_registration":                        "offsite_conversion.fb_pixel_complete_registration",
    "omni_complete_registration":                   "offsite_conversion.fb_pixel_complete_registration",
    "offsite_complete_registration_add_meta_leads": "offsite_conversion.fb_pixel_complete_registration",
    "onsite_conversion.lead_grouped":               "lead",
    "onsite_web_lead":                              "lead",
    "purchase":                                     "omni_purchase",
}

# Action types "primary" — ini adalah result konversi utama, bukan supporting metrics
# Jika campaign punya salah satu dari ini, link_click TIDAK dipakai sebagai fallback
PRIMARY_CONVERSION_TYPES = {
    "offsite_conversion.fb_pixel_complete_registration",
    "offsite_conversion.fb_pixel_subscribe",
    "offsite_conversion.fb_pixel_purchase",
    "offsite_conversion.fb_pixel_lead",
    "onsite_conversion.messaging_conversation_started_7d",
    "lead",
    "omni_purchase",
    "omni_complete_registration",
    "complete_registration",
    "offsite_complete_registration_add_meta_leads",
    "onsite_web_lead",
    "onsite_conversion.lead_grouped",
    "purchase",
}


def now_wib():
    return datetime.utcnow() + WIB_OFFSET


def get_meta_balance(account_id):
    url = f"https://graph.facebook.com/v19.0/{account_id.strip()}"
    params = {
        "fields": "balance,currency,name,amount_spent,spend_cap,funding_source_details",
        "access_token": META_TOKEN,
    }
    res = requests.get(url, params=params)
    res.raise_for_status()
    return res.json()


def get_effective_balance(account_id, data):
    account_id_clean = account_id.strip().lower()
    spend_cap_raw    = int(data.get("spend_cap", 0))
    amount_spent_raw = int(data.get("amount_spent", 0))
    balance_raw      = int(data.get("balance", 0))

    # Postpaid — sistem bayar tagihan otomatis
    if account_id_clean in {a.lower() for a in POSTPAID_ACCOUNTS}:
        threshold     = POSTPAID_ACCOUNTS[account_id_clean]
        # balance untuk akun postpaid sudah dalam Rupiah (bukan cents)
        outstanding   = float(balance_raw)
        ruang_tersisa = threshold - outstanding
        return ruang_tersisa, "Postpaid", threshold

    if account_id_clean in {a.lower() for a in CREDIT_LINE_ACCOUNTS}:
        # Credit Line dengan spending limit — sisa = spend_cap - amount_spent
        if spend_cap_raw > 0:
            sisa = spend_cap_raw - amount_spent_raw
            return float(sisa), "Credit Line", float(spend_cap_raw)
        else:
            return balance_raw / 100, "Kartu Kredit", None
    else:
        funding      = data.get("funding_source_details", {})
        display_str  = funding.get("display_string", "")
        funding_type = int(funding.get("type", 0))
        if funding_type == 1:
            return balance_raw / 100, "Kartu Kredit", None
        numbers = re.findall(r"[\d,]+", display_str)
        if numbers:
            saldo = max(int(n.replace(",", "")) for n in numbers)
            return float(saldo), "Prepaid", None
        return balance_raw / 100, "Prepaid", None


def get_account_insights(account_id, date_str):
    url = f"https://graph.facebook.com/v19.0/{account_id.strip()}/insights"
    params = {
        "fields": "spend,impressions,reach,clicks,ctr,cpm,frequency,actions,action_values",
        "time_range": f'{{"since":"{date_str}","until":"{date_str}"}}',
        "level": "account",
        "access_token": META_TOKEN,
    }
    res = requests.get(url, params=params)
    res.raise_for_status()
    data = res.json()
    return data["data"][0] if data.get("data") else None


def get_campaign_insights(account_id, date_str):
    url = f"https://graph.facebook.com/v19.0/{account_id.strip()}/insights"
    params = {
        "fields": "campaign_name,spend,actions",
        "time_range": f'{{"since":"{date_str}","until":"{date_str}"}}',
        "level": "campaign",
        "access_token": META_TOKEN,
    }
    res = requests.get(url, params=params)
    res.raise_for_status()
    data = res.json()
    return data.get("data", [])


def normalize_actions(actions_raw):
    """Normalisasi action_type menggunakan alias, return dict action_type → value."""
    result = {}
    for a in actions_raw:
        action_type = a["action_type"]
        value       = float(a["value"])
        # Normalisasi alias
        canonical = ACTION_ALIASES.get(action_type, action_type)
        if canonical not in result or result[canonical] < value:
            result[canonical] = value
        # Simpan juga versi aslinya
        if action_type not in result or result[action_type] < value:
            result[action_type] = value
    return result


def build_result_breakdown(account_id, campaigns):
    """
    Untuk setiap campaign:
    1. Cek apakah ada PRIMARY_CONVERSION_TYPES di actions
    2. Kalau ada → gunakan itu sebagai result (bukan link_click)
    3. Kalau tidak ada → gunakan link_click sebagai fallback (Instagram Profile Visits)
    """
    account_id_clean = account_id.strip().lower()
    result_config    = ACCOUNT_RESULTS.get(account_id_clean, [])

    if not result_config:
        return []

    # Build lookup: action_type → label info
    # Pisahkan mana yang "instagram_profile_visit" (fallback) vs konversi utama
    primary_label_map  = {}  # action_type → label (untuk konversi utama)
    fallback_label     = None  # label untuk instagram_profile_visit (link_click fallback)

    for action_type, emoji, label in result_config:
        if action_type == "instagram_profile_visit":
            fallback_label = (emoji, label)
        else:
            # Hanya tambahkan exact action_type yang didefinisikan per akun
            # TIDAK tambah alias otomatis agar tidak ada false positive
            primary_label_map[action_type] = (emoji, label)

    # Inisialisasi akumulasi per label
    label_data = {}
    for action_type, emoji, label in result_config:
        if label not in label_data:
            label_data[label] = {"emoji": emoji, "label": label, "results": 0, "spent": 0.0}

    # Proses tiap campaign
    for camp in campaigns:
        spent   = float(camp.get("spend", 0))
        actions = normalize_actions(camp.get("actions", []))

        if spent <= 0:
            continue

        # Cek apakah campaign ini adalah Traffic campaign (hanya untuk akun tertentu)
        camp_name    = camp.get("campaign_name", "")
        traffic_kws  = TRAFFIC_KEYWORDS_PER_ACCOUNT.get(account_id_clean, [])
        is_traffic   = any(kw in camp_name for kw in traffic_kws)

        if is_traffic:
            # Traffic campaign → link_click sebagai Instagram Profile Visits
            if fallback_label and "link_click" in actions:
                _, label = fallback_label
                count    = int(actions["link_click"])
                if label in label_data:
                    label_data[label]["results"] += count
                    label_data[label]["spent"]   += spent
        else:
            # Non-traffic → cek result dari daftar akun (primary only)
            best_label = None
            best_count = 0
            for action_type, (emoji, label) in primary_label_map.items():
                if action_type in actions:
                    count = int(actions[action_type])
                    if count > best_count:
                        best_count = count
                        best_label = label

            if best_label and best_count > 0:
                label_data[best_label]["results"] += best_count
                label_data[best_label]["spent"]   += spent
            else:
                # Tidak ada primary result
                # Kalau akun ini PUNYA Traffic keyword → SKIP (sudah dihandle di is_traffic)
                # Kalau akun ini TIDAK punya Traffic keyword → fallback ke link_click (Instagram Profile Visits)
                if not traffic_kws and fallback_label and "link_click" in actions:
                    _, label = fallback_label
                    count    = int(actions["link_click"])
                    if label in label_data:
                        label_data[label]["results"] += count
                        label_data[label]["spent"]   += spent

    # Format hasil
    breakdown = []
    for label, d in label_data.items():
        cpr = d["spent"] / d["results"] if d["results"] > 0 else 0
        breakdown.append({
            "emoji":   d["emoji"],
            "label":   d["label"],
            "results": d["results"],
            "spent":   d["spent"],
            "cpr":     cpr,
        })

    breakdown.sort(key=lambda x: (-x["spent"], x["label"]))
    return breakdown


def format_idr(amount):
    return f"Rp {int(round(float(amount))):,}".replace(",", ".")


def format_tanggal(dt):
    hari_map  = {"Monday":"Senin","Tuesday":"Selasa","Wednesday":"Rabu","Thursday":"Kamis","Friday":"Jumat","Saturday":"Sabtu","Sunday":"Minggu"}
    bulan_map = {1:"Januari",2:"Februari",3:"Maret",4:"April",5:"Mei",6:"Juni",7:"Juli",8:"Agustus",9:"September",10:"Oktober",11:"November",12:"Desember"}
    return f"{hari_map[dt.strftime('%A')]}, {dt.day} {bulan_map[dt.month]} {dt.year}"


def get_saldo_status(balance, tipe=""):
    if tipe == "Postpaid":
        # Untuk postpaid: balance = ruang tersisa sebelum ditagih
        if balance <= 0:
            return "🔴", "🚨 <b>Tagihan sudah mencapai threshold!</b> Kartu akan segera ditagih otomatis."
        elif balance < 500_000:
            return "🔴", "🚨 <b>Ruang tagihan tinggal &lt; Rp 500.000!</b> Kartu akan segera ditagih otomatis."
        elif balance < 1_000_000:
            return "💛", "💛 Ruang tagihan tinggal &lt; Rp 1jt — kartu akan segera ditagih."
        return "🟢", None
    # Akun non-postpaid (Prepaid, Credit Line, Kartu Kredit)
    if balance <= 0:
        return "🔴", "🚨 <b>SALDO HABIS!</b> Segera top up — iklan sudah berhenti atau akan berhenti selamanya!"
    elif balance < THRESHOLD_CRITICAL:
        return "🔴", "🚨 <b>Saldo di bawah Rp 100.000!</b> Segera top up sekarang — iklanmu hampir mati!"
    elif balance < THRESHOLD_WARNING:
        return "💛", "💛 Saldo tinggal &lt; Rp 1jt, pertimbangkan top up."
    return "🟢", None


def send_telegram(message, chat_id=None):
    """Kirim pesan ke Telegram. Jika chat_id tidak diisi, pakai default."""
    target = chat_id or TELEGRAM_CHAT_ID
    url    = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    res    = requests.post(url, json={"chat_id": target, "text": message, "parse_mode": "HTML"})
    res.raise_for_status()


def get_purchase_metrics(acct_insights):
    """Ambil Purchase count, Purchase Value, Cost per Purchase, dan ROAS."""
    actions      = {a["action_type"]: float(a["value"]) for a in acct_insights.get("actions", [])}
    action_values = {a["action_type"]: float(a["value"]) for a in acct_insights.get("action_values", [])}
    spend        = float(acct_insights.get("spend", 0))

    # Ambil purchase count — pakai omni_purchase sebagai primary
    purchase_keys = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"]
    total_purchase = 0
    for key in purchase_keys:
        if key in actions:
            total_purchase = int(actions[key])
            break

    # Ambil purchase value
    purchase_value = 0.0
    for key in purchase_keys:
        if key in action_values:
            purchase_value = float(action_values[key])
            break

    cost_per_purchase = spend / total_purchase if total_purchase > 0 else 0
    roas              = purchase_value / spend if spend > 0 else 0

    return total_purchase, purchase_value, cost_per_purchase, roas


def main():
    today_wib     = now_wib()
    yesterday_wib = today_wib - timedelta(days=1)
    yesterday_str = yesterday_wib.strftime("%Y-%m-%d")

    tanggal_data   = format_tanggal(yesterday_wib)
    tanggal_report = format_tanggal(today_wib)

    print(f"Laporan data : {tanggal_data}")
    print(f"Di-report    : {tanggal_report}")
    print(f"Mengambil data {len(AD_ACCOUNT_IDS)} akun...")

    for i, account_id in enumerate(AD_ACCOUNT_IDS):
        account_id = account_id.strip()
        try:
            balance_data     = get_meta_balance(account_id)
            acct_insights    = get_account_insights(account_id, yesterday_str)
            camp_insights    = get_campaign_insights(account_id, yesterday_str)
            name             = balance_data.get("name", "Unknown")
            balance, tipe, spend_lim = get_effective_balance(account_id, balance_data)
            status_emoji, warning_msg = get_saldo_status(balance, tipe)

            lines = [
                "📊 <b>Laporan Meta Ads Harian</b>",
                f"📅 {tanggal_data}",
                f"🗓 Di report pada {tanggal_report}",
                "━━━━━━━━━━━━━━━━━━",
                f"🏢 <b>Akun:</b> {name}",
                f"💳 <b>Tipe:</b> {tipe}",
            ]
            if tipe == "Postpaid" and spend_lim:
                outstanding = spend_lim - balance
                lines += [
                    f"💳 <b>Billing Threshold:</b> {format_idr(spend_lim)}",
                    f"📋 <b>Outstanding Balance:</b> {format_idr(outstanding)}",
                    f"{status_emoji} <b>Ruang Sebelum Ditagih:</b> {format_idr(balance)}",
                ]
            elif tipe == "Credit Line" and spend_lim:
                lines.append(f"🎯 <b>Spending Limit:</b> {format_idr(spend_lim)}")
                lines.append(f"{status_emoji} <b>Sisa Saldo:</b> {format_idr(balance)}")
            else:
                lines.append(f"{status_emoji} <b>Sisa Saldo:</b> {format_idr(balance)}")
            lines += ["", "📈 <b>Performa Kemarin:</b>"]

            if acct_insights:
                spend        = float(acct_insights.get("spend", 0))
                # Ambil link_click dari actions (bukan field clicks yang menghitung semua jenis klik)
                actions_map  = {a["action_type"]: float(a["value"]) for a in acct_insights.get("actions", [])}
                link_clicks  = int(actions_map.get("link_click", 0))
                # Hitung CPC = spend / link_click (sesuai definisi dashboard Meta)
                cpc_manual   = spend / link_clicks if link_clicks > 0 else 0
                lines += [
                    f"💸 Total Spent: {format_idr(spend)}",
                    f"👁 Impressions: {int(acct_insights.get('impressions', 0)):,}".replace(",", "."),
                    f"🎯 Reach: {int(acct_insights.get('reach', 0)):,}".replace(",", "."),
                    f"🔁 Frequency: {float(acct_insights.get('frequency', 0)):.2f}x",
                    f"🖱 Link Clicks: {link_clicks:,}".replace(",", "."),
                    f"📈 CTR: {float(acct_insights.get('ctr', 0)):.2f}%",
                    f"📊 CPM: {format_idr(acct_insights.get('cpm', 0))}",
                    f"💰 CPC (Cost per Link Click): {format_idr(cpc_manual)}",
                ]
            else:
                lines.append("<i>Tidak ada aktivitas iklan kemarin</i>")

            breakdown = build_result_breakdown(account_id, camp_insights)
            if breakdown:
                lines += ["", "🎯 <b>Breakdown Result:</b>"]
                for j, obj in enumerate(breakdown):
                    is_last   = (j == len(breakdown) - 1)
                    connector = "└" if is_last else "├"
                    if obj["results"] > 0:
                        lines += [
                            f"{connector} <b>{obj['emoji']} {obj['label']}</b>",
                            f"│  ✅ Total Result: {obj['results']:,}".replace(",", "."),
                            f"│  💸 Total Spent: {format_idr(obj['spent'])}",
                            f"│  💵 Cost/Result: {format_idr(obj['cpr'])}",
                        ]
                    else:
                        lines += [
                            f"{connector} <b>{obj['emoji']} {obj['label']}</b>",
                            f"│  ✅ Total Result: 0",
                            f"│  💸 Total Spent: Rp 0",
                            f"│  💵 Cost/Result: <i>N/A</i>",
                        ]
                    if not is_last:
                        lines.append("│")

            # Purchase Metrics khusus MJO-1641 & MJO-1416
            if account_id.lower() in {a.lower() for a in PURCHASE_METRICS_ACCOUNTS} and acct_insights:
                total_purchase, purchase_value, cpp, roas = get_purchase_metrics(acct_insights)
                lines += ["", "🛒 <b>Purchase Metrics:</b>"]
                if total_purchase > 0:
                    lines += [
                        f"✅ Total Purchase: {total_purchase:,}".replace(",", "."),
                        f"💵 Cost per Purchase: {format_idr(cpp)}",
                        f"💰 Purchase Value: {format_idr(purchase_value)}",
                        f"📈 ROAS: {roas:.2f}x",
                    ]
                else:
                    lines += [
                        f"✅ Total Purchase: 0",
                        f"💵 Cost per Purchase: <i>N/A</i>",
                        f"💰 Purchase Value: Rp 0",
                        f"📈 ROAS: <i>N/A</i>",
                    ]

            if warning_msg:
                lines += ["", warning_msg]

            message = "\n".join(lines)

            # Kirim ke grup utama
            send_telegram(message)

            # Kirim ke grup tambahan jika ada
            extra_chat_id = EXTRA_TELEGRAM_TARGETS.get(account_id.lower())
            if extra_chat_id:
                send_telegram(message, chat_id=extra_chat_id)
                print(f"       → Juga dikirim ke grup khusus ({extra_chat_id})")

            print(f"  [{i+1}] OK — {name} | Saldo: {format_idr(balance)} [{tipe}]")

        except Exception as e:
            print(f"  [{i+1}] GAGAL — {account_id}: {e}")
            err_msg = (
                f"📊 <b>Laporan Meta Ads Harian</b>\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"🆔 <code>{account_id}</code>\n"
                f"❌ Gagal mengambil data: {e}"
            )
            send_telegram(err_msg)
            extra_chat_id = EXTRA_TELEGRAM_TARGETS.get(account_id.lower())
            if extra_chat_id:
                send_telegram(err_msg, chat_id=extra_chat_id)

    print("✅ Semua notifikasi berhasil dikirim!")


if __name__ == "__main__":
    main()
