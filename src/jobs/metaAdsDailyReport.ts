/**
 * Meta Ads Daily Report Job
 *
 * Dijalankan tiap pagi (jam 07:00 WIB) untuk:
 * 1. Ambil semua fb_act aktif beserta token dan konfigurasi dari data_json
 * 2. Panggil Meta Graph API untuk saldo + insights + campaign
 * 3. Hitung billing status (prepaid/credit_line/postpaid)
 * 4. Hitung result breakdown berdasarkan konfigurasi per akun
 * 5. Simpan ke tabel DB (fb_act_daily_data, fb_act_campaign_daily_insights, fb_act_result_breakdown_daily)
 * 6. Kirim notifikasi Telegram (grup utama + grup extra per akun)
 * 7. Catat log ke fb_act_notifications_log dan fb_act_report_runs
 */

import { db } from "../db/client";
import {
  fbAct,
  fbToken,
  fbActDailyData,
  fbActCampaignDailyInsights,
  fbActResultBreakdownDaily,
  fbActNotificationsLog,
  fbActReportRuns,
} from "../db/schema";
import { eq, and, isNotNull } from "drizzle-orm";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const META_API_BASE = "https://graph.facebook.com/v20.0";
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const THRESHOLD_CRITICAL = 100_000;
const THRESHOLD_WARNING = 1_000_000;

// Action aliases — normalisasi action_type yang artinya sama
const ACTION_ALIASES: Record<string, string> = {
  complete_registration: "offsite_conversion.fb_pixel_complete_registration",
  omni_complete_registration: "offsite_conversion.fb_pixel_complete_registration",
  offsite_complete_registration_add_meta_leads: "offsite_conversion.fb_pixel_complete_registration",
  "onsite_conversion.lead_grouped": "lead",
  onsite_web_lead: "lead",
  purchase: "omni_purchase",
};

// Action types yang dianggap "primary conversion" — jika ada ini, link_click tidak dipakai sebagai fallback
const PRIMARY_CONVERSION_TYPES = new Set([
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
]);

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ResultConfigItem {
  emoji: string;
  action_type: string;
  label: string;
}

interface FbActConfig {
  billing_type?: "prepaid" | "credit_line" | "postpaid";
  spending_limit?: number;       // credit_line: spending limit dalam Rupiah
  billing_threshold?: number;    // postpaid: threshold sebelum ditagih
  results?: ResultConfigItem[];  // konfigurasi result per akun
  purchase_metrics?: boolean;    // tampilkan Purchase Metrics
  extra_telegram_chat_id?: string; // grup Telegram tambahan
  keyword_traffic?: string;      // kata kunci nama campaign Traffic (spasi = multi keyword)
  telegram_chat_id?: string;     // override chat_id utama
  [key: string]: unknown;
}

interface MetaBalanceData {
  name?: string;
  balance?: string;
  amount_spent?: string;
  spend_cap?: string;
  currency?: string;
  funding_source_details?: {
    display_string?: string;
    type?: string | number;
  };
}

interface ActionEntry {
  action_type: string;
  value: string;
}

interface MetaInsightData {
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  actions?: ActionEntry[];
  action_values?: ActionEntry[];
}

interface CampaignInsight extends MetaInsightData {
  campaign_id?: string;
  campaign_name?: string;
}

interface EffectiveBalance {
  balance: number;
  balanceType: string;
  spendingLimit: number | null;
  outstandingBalance: number | null;
}

interface BreakdownResult {
  emoji: string;
  label: string;
  results: number;
  spent: number;
  cpr: number;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function nowWib(): Date {
  return new Date(Date.now() + WIB_OFFSET_MS);
}

function formatIdr(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
}

function formatTanggal(d: Date): string {
  const hariMap: Record<string, string> = {
    Sunday: "Minggu", Monday: "Senin", Tuesday: "Selasa", Wednesday: "Rabu",
    Thursday: "Kamis", Friday: "Jumat", Saturday: "Sabtu",
  };
  const bulanMap: Record<number, string> = {
    0: "Januari", 1: "Februari", 2: "Maret", 3: "April", 4: "Mei", 5: "Juni",
    6: "Juli", 7: "Agustus", 8: "September", 9: "Oktober", 10: "November", 11: "Desember",
  };
  const dayName = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `${hariMap[dayName]}, ${d.getUTCDate()} ${bulanMap[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function normalizeActions(actionsRaw: ActionEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const a of actionsRaw) {
    const val = parseFloat(a.value);
    const canonical = ACTION_ALIASES[a.action_type] ?? a.action_type;
    if (!(canonical in result) || result[canonical] < val) result[canonical] = val;
    if (!(a.action_type in result) || result[a.action_type] < val) result[a.action_type] = val;
  }
  return result;
}

// ─────────────────────────────────────────────
// Meta API
// ─────────────────────────────────────────────

async function metaGet(path: string, params: Record<string, string>, token: string): Promise<any> {
  const url = new URL(`${META_API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  const json: any = await res.json();
  if (json.error) throw new Error(`Meta API [${path}]: ${json.error.message}`);
  return json;
}

async function getMetaBalance(actId: string, token: string): Promise<MetaBalanceData> {
  return metaGet(actId, {
    fields: "balance,currency,name,amount_spent,spend_cap,funding_source_details",
  }, token);
}

async function getAccountInsights(actId: string, token: string, dateStr: string): Promise<MetaInsightData | null> {
  const data = await metaGet(`${actId}/insights`, {
    fields: "spend,impressions,reach,clicks,ctr,cpm,frequency,actions,action_values",
    time_range: JSON.stringify({ since: dateStr, until: dateStr }),
    level: "account",
  }, token);
  return data?.data?.[0] ?? null;
}

async function getCampaignInsights(actId: string, token: string, dateStr: string): Promise<CampaignInsight[]> {
  const data = await metaGet(`${actId}/insights`, {
    fields: "campaign_id,campaign_name,spend,actions",
    time_range: JSON.stringify({ since: dateStr, until: dateStr }),
    level: "campaign",
  }, token);
  return data?.data ?? [];
}

// ─────────────────────────────────────────────
// Billing Logic
// ─────────────────────────────────────────────

function getEffectiveBalance(config: FbActConfig, balanceData: MetaBalanceData): EffectiveBalance {
  const spendCapRaw = parseInt(balanceData.spend_cap ?? "0", 10);
  const amountSpentRaw = parseInt(balanceData.amount_spent ?? "0", 10);
  const balanceRaw = parseInt(balanceData.balance ?? "0", 10);

  if (config.billing_type === "postpaid") {
    const threshold = config.billing_threshold ?? 0;
    const outstanding = balanceRaw; // postpaid: balance = outstanding dalam Rupiah
    const ruangTersisa = threshold - outstanding;
    return { balance: ruangTersisa, balanceType: "Postpaid", spendingLimit: threshold, outstandingBalance: outstanding };
  }

  if (config.billing_type === "credit_line") {
    const spendingLimit = config.spending_limit ?? spendCapRaw;
    if (spendingLimit > 0) {
      const sisa = spendingLimit - amountSpentRaw;
      return { balance: sisa, balanceType: "Credit Line", spendingLimit, outstandingBalance: null };
    }
    // Credit line tanpa spending limit → Kartu Kredit, pakai balance / 100
    return { balance: balanceRaw / 100, balanceType: "Kartu Kredit", spendingLimit: null, outstandingBalance: null };
  }

  // Prepaid — cek funding_source_details
  const funding = balanceData.funding_source_details ?? {};
  const fundingType = parseInt(String(funding.type ?? "0"), 10);
  if (fundingType === 1) {
    return { balance: balanceRaw / 100, balanceType: "Kartu Kredit", spendingLimit: null, outstandingBalance: null };
  }
  const displayStr = funding.display_string ?? "";
  const numbers = [...displayStr.matchAll(/[\d,]+/g)].map((m) => parseInt(m[0].replace(/,/g, ""), 10));
  if (numbers.length > 0) {
    const saldo = Math.max(...numbers);
    return { balance: saldo, balanceType: "Prepaid", spendingLimit: null, outstandingBalance: null };
  }
  return { balance: balanceRaw / 100, balanceType: "Prepaid", spendingLimit: null, outstandingBalance: null };
}

function getSaldoStatus(balance: number, balanceType: string): { emoji: string; warningMsg: string | null } {
  if (balanceType === "Postpaid") {
    if (balance <= 0) return { emoji: "🔴", warningMsg: "🚨 <b>Tagihan sudah mencapai threshold!</b> Kartu akan segera ditagih otomatis." };
    if (balance < 500_000) return { emoji: "🔴", warningMsg: "🚨 <b>Ruang tagihan tinggal &lt; Rp 500.000!</b> Kartu akan segera ditagih otomatis." };
    if (balance < 1_000_000) return { emoji: "💛", warningMsg: "💛 Ruang tagihan tinggal &lt; Rp 1jt — kartu akan segera ditagih." };
    return { emoji: "🟢", warningMsg: null };
  }
  if (balance <= 0) return { emoji: "🔴", warningMsg: "🚨 <b>SALDO HABIS!</b> Segera top up — iklan sudah berhenti atau akan berhenti selamanya!" };
  if (balance < THRESHOLD_CRITICAL) return { emoji: "🔴", warningMsg: "🚨 <b>Saldo di bawah Rp 100.000!</b> Segera top up sekarang — iklanmu hampir mati!" };
  if (balance < THRESHOLD_WARNING) return { emoji: "💛", warningMsg: "💛 Saldo tinggal &lt; Rp 1jt, pertimbangkan top up." };
  return { emoji: "🟢", warningMsg: null };
}

// ─────────────────────────────────────────────
// Result Breakdown
// ─────────────────────────────────────────────

function buildResultBreakdown(
  config: FbActConfig,
  campaigns: CampaignInsight[],
): BreakdownResult[] {
  const resultConfig = config.results ?? [];
  if (resultConfig.length === 0) return [];

  const trafficKeywords = config.keyword_traffic
    ? config.keyword_traffic.split(/\s+/).filter(Boolean)
    : [];

  const primaryLabelMap: Record<string, { emoji: string; label: string }> = {};
  let fallbackLabel: { emoji: string; label: string } | null = null;

  for (const item of resultConfig) {
    if (item.action_type === "instagram_profile_visit") {
      fallbackLabel = { emoji: item.emoji, label: item.label };
    } else {
      primaryLabelMap[item.action_type] = { emoji: item.emoji, label: item.label };
    }
  }

  // Init accumulator per label
  const labelData: Record<string, { emoji: string; label: string; results: number; spent: number }> = {};
  for (const item of resultConfig) {
    if (!(item.label in labelData)) {
      labelData[item.label] = { emoji: item.emoji, label: item.label, results: 0, spent: 0 };
    }
  }

  for (const camp of campaigns) {
    const spent = parseFloat(camp.spend ?? "0");
    if (spent <= 0) continue;

    const actions = normalizeActions(camp.actions ?? []);
    const campName = camp.campaign_name ?? "";
    const isTraffic = trafficKeywords.length > 0 && trafficKeywords.some((kw) => campName.includes(kw));

    if (isTraffic) {
      if (fallbackLabel && "link_click" in actions) {
        const count = Math.round(actions["link_click"]);
        if (fallbackLabel.label in labelData) {
          labelData[fallbackLabel.label].results += count;
          labelData[fallbackLabel.label].spent += spent;
        }
      }
    } else {
      let bestLabel: string | null = null;
      let bestCount = 0;

      for (const [actionType, info] of Object.entries(primaryLabelMap)) {
        if (actionType in actions) {
          const count = Math.round(actions[actionType]);
          if (count > bestCount) {
            bestCount = count;
            bestLabel = info.label;
          }
        }
      }

      if (bestLabel && bestCount > 0) {
        labelData[bestLabel].results += bestCount;
        labelData[bestLabel].spent += spent;
      } else if (!trafficKeywords.length && fallbackLabel && "link_click" in actions) {
        const count = Math.round(actions["link_click"]);
        if (fallbackLabel.label in labelData) {
          labelData[fallbackLabel.label].results += count;
          labelData[fallbackLabel.label].spent += spent;
        }
      }
    }
  }

  const breakdown: BreakdownResult[] = Object.values(labelData).map((d) => ({
    emoji: d.emoji,
    label: d.label,
    results: d.results,
    spent: d.spent,
    cpr: d.results > 0 ? d.spent / d.results : 0,
  }));

  breakdown.sort((a, b) => b.spent - a.spent || a.label.localeCompare(b.label));
  return breakdown;
}

// ─────────────────────────────────────────────
// Purchase Metrics
// ─────────────────────────────────────────────

interface PurchaseMetrics {
  totalPurchase: number;
  purchaseValue: number;
  costPerPurchase: number;
  roas: number;
}

function getPurchaseMetrics(acctInsights: MetaInsightData): PurchaseMetrics {
  const actions: Record<string, number> = {};
  const actionValues: Record<string, number> = {};
  for (const a of acctInsights.actions ?? []) actions[a.action_type] = parseFloat(a.value);
  for (const a of acctInsights.action_values ?? []) actionValues[a.action_type] = parseFloat(a.value);
  const spend = parseFloat(acctInsights.spend ?? "0");

  const purchaseKeys = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"];
  let totalPurchase = 0;
  for (const k of purchaseKeys) {
    if (k in actions) { totalPurchase = Math.round(actions[k]); break; }
  }
  let purchaseValue = 0;
  for (const k of purchaseKeys) {
    if (k in actionValues) { purchaseValue = actionValues[k]; break; }
  }

  return {
    totalPurchase,
    purchaseValue,
    costPerPurchase: totalPurchase > 0 ? spend / totalPurchase : 0,
    roas: spend > 0 ? purchaseValue / spend : 0,
  };
}

// ─────────────────────────────────────────────
// Telegram
// ─────────────────────────────────────────────

async function sendTelegram(message: string, chatId: string, botToken: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
  });
  const json: any = await res.json();
  if (!json.ok) throw new Error(`Telegram error: ${json.description}`);
}

// ─────────────────────────────────────────────
// Build Message
// ─────────────────────────────────────────────

function buildMessage(opts: {
  accountName: string;
  tanggalData: string;
  tanggalReport: string;
  balanceInfo: EffectiveBalance;
  statusEmoji: string;
  warningMsg: string | null;
  acctInsights: MetaInsightData | null;
  breakdown: BreakdownResult[];
  purchaseMetrics: PurchaseMetrics | null;
}): string {
  const { accountName, tanggalData, tanggalReport, balanceInfo, statusEmoji, warningMsg, acctInsights, breakdown, purchaseMetrics } = opts;

  const lines: string[] = [
    "📊 <b>Laporan Meta Ads Harian</b>",
    `📅 ${tanggalData}`,
    `🗓 Di report pada ${tanggalReport}`,
    "━━━━━━━━━━━━━━━━━━",
    `🏢 <b>Akun:</b> ${accountName}`,
    `💳 <b>Tipe:</b> ${balanceInfo.balanceType}`,
  ];

  if (balanceInfo.balanceType === "Postpaid" && balanceInfo.spendingLimit) {
    const outstanding = balanceInfo.outstandingBalance ?? (balanceInfo.spendingLimit - balanceInfo.balance);
    lines.push(`💳 <b>Billing Threshold:</b> ${formatIdr(balanceInfo.spendingLimit)}`);
    lines.push(`📋 <b>Outstanding Balance:</b> ${formatIdr(outstanding)}`);
    lines.push(`${statusEmoji} <b>Ruang Sebelum Ditagih:</b> ${formatIdr(balanceInfo.balance)}`);
  } else if (balanceInfo.balanceType === "Credit Line" && balanceInfo.spendingLimit) {
    lines.push(`🎯 <b>Spending Limit:</b> ${formatIdr(balanceInfo.spendingLimit)}`);
    lines.push(`${statusEmoji} <b>Sisa Saldo:</b> ${formatIdr(balanceInfo.balance)}`);
  } else {
    lines.push(`${statusEmoji} <b>Sisa Saldo:</b> ${formatIdr(balanceInfo.balance)}`);
  }

  lines.push("", "📈 <b>Performa Kemarin:</b>");

  if (acctInsights) {
    const spend = parseFloat(acctInsights.spend ?? "0");
    const actionsMap: Record<string, number> = {};
    for (const a of acctInsights.actions ?? []) actionsMap[a.action_type] = parseFloat(a.value);
    const linkClicks = Math.round(actionsMap["link_click"] ?? 0);
    const cpcManual = linkClicks > 0 ? spend / linkClicks : 0;

    lines.push(
      `💸 Total Spent: ${formatIdr(spend)}`,
      `👁 Impressions: ${parseInt(acctInsights.impressions ?? "0").toLocaleString("id-ID")}`,
      `🎯 Reach: ${parseInt(acctInsights.reach ?? "0").toLocaleString("id-ID")}`,
      `🔁 Frequency: ${parseFloat(acctInsights.frequency ?? "0").toFixed(2)}x`,
      `🖱 Link Clicks: ${linkClicks.toLocaleString("id-ID")}`,
      `📈 CTR: ${parseFloat(acctInsights.ctr ?? "0").toFixed(2)}%`,
      `📊 CPM: ${formatIdr(parseFloat(acctInsights.cpm ?? "0"))}`,
      `💰 CPC (Cost per Link Click): ${formatIdr(cpcManual)}`,
    );
  } else {
    lines.push("<i>Tidak ada aktivitas iklan kemarin</i>");
  }

  if (breakdown.length > 0) {
    lines.push("", "🎯 <b>Breakdown Result:</b>");
    for (let j = 0; j < breakdown.length; j++) {
      const obj = breakdown[j];
      const isLast = j === breakdown.length - 1;
      const conn = isLast ? "└" : "├";
      if (obj.results > 0) {
        lines.push(
          `${conn} <b>${obj.emoji} ${obj.label}</b>`,
          `│  ✅ Total Result: ${obj.results.toLocaleString("id-ID")}`,
          `│  💸 Total Spent: ${formatIdr(obj.spent)}`,
          `│  💵 Cost/Result: ${formatIdr(obj.cpr)}`,
        );
      } else {
        lines.push(
          `${conn} <b>${obj.emoji} ${obj.label}</b>`,
          `│  ✅ Total Result: 0`,
          `│  💸 Total Spent: Rp 0`,
          `│  💵 Cost/Result: <i>N/A</i>`,
        );
      }
      if (!isLast) lines.push("│");
    }
  }

  if (purchaseMetrics) {
    lines.push("", "🛒 <b>Purchase Metrics:</b>");
    if (purchaseMetrics.totalPurchase > 0) {
      lines.push(
        `✅ Total Purchase: ${purchaseMetrics.totalPurchase.toLocaleString("id-ID")}`,
        `💵 Cost per Purchase: ${formatIdr(purchaseMetrics.costPerPurchase)}`,
        `💰 Purchase Value: ${formatIdr(purchaseMetrics.purchaseValue)}`,
        `📈 ROAS: ${purchaseMetrics.roas.toFixed(2)}x`,
      );
    } else {
      lines.push(
        `✅ Total Purchase: 0`,
        `💵 Cost per Purchase: <i>N/A</i>`,
        `💰 Purchase Value: Rp 0`,
        `📈 ROAS: <i>N/A</i>`,
      );
    }
  }

  if (warningMsg) lines.push("", warningMsg);

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// Main Job
// ─────────────────────────────────────────────

export async function runMetaAdsDailyReport(): Promise<void> {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (!telegramBotToken || !telegramChatId) {
    console.error("[MetaAdsJob] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — aborting");
    return;
  }

  const todayWib = nowWib();
  const yesterdayWib = new Date(todayWib.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterdayWib.toISOString().slice(0, 10);

  const tanggalData = formatTanggal(yesterdayWib);
  const tanggalReport = formatTanggal(todayWib);

  console.log(`[MetaAdsJob] Laporan data: ${tanggalData}`);
  console.log(`[MetaAdsJob] Di-report: ${tanggalReport}`);

  // Buat atau update report run record
  let runId: number | null = null;
  try {
    const runDate = yesterdayStr;
    const existing = await db.select({ id: fbActReportRuns.id })
      .from(fbActReportRuns)
      .where(eq(fbActReportRuns.date, runDate))
      .limit(1);

    if (existing.length > 0) {
      runId = existing[0].id;
      await db.update(fbActReportRuns)
        .set({ startedAt: new Date(), accountsTotal: 0, accountsSuccess: 0, accountsFailed: 0 })
        .where(eq(fbActReportRuns.id, runId));
    } else {
      const [ins] = await db.insert(fbActReportRuns).values({
        date: runDate,
        startedAt: new Date(),
        accountsTotal: 0,
        accountsSuccess: 0,
        accountsFailed: 0,
      }).$returningId();
      runId = ins.id;
    }
  } catch (e) {
    console.error("[MetaAdsJob] Failed to create report run:", e);
  }

  // Ambil semua fb_act yang punya token
  const acts = await db
    .select({
      id: fbAct.id,
      actId: fbAct.actId,
      actName: fbAct.actName,
      name: fbAct.name,
      dataJson: fbAct.dataJson,
      token: fbToken.token,
    })
    .from(fbAct)
    .innerJoin(fbToken, eq(fbAct.tokenId, fbToken.id))
    .where(eq(fbToken.status, 1));

  const total = acts.length;
  let success = 0;
  let failed = 0;

  console.log(`[MetaAdsJob] Mengambil data ${total} akun...`);

  for (let i = 0; i < acts.length; i++) {
    const act = acts[i];
    const actIdFull = act.actId.startsWith("act_") ? act.actId : `act_${act.actId}`;
    const config: FbActConfig = typeof act.dataJson === "string"
      ? JSON.parse(act.dataJson)
      : (act.dataJson as FbActConfig ?? {});

    try {
      // 1. Ambil data dari Meta API
      const [balanceData, acctInsights, campInsights] = await Promise.all([
        getMetaBalance(actIdFull, act.token),
        getAccountInsights(actIdFull, act.token, yesterdayStr),
        getCampaignInsights(actIdFull, act.token, yesterdayStr),
      ]);

      const accountName = balanceData.name ?? act.actName ?? act.name ?? actIdFull;

      // 2. Hitung billing
      const balanceInfo = getEffectiveBalance(config, balanceData);
      const { emoji: statusEmoji, warningMsg } = getSaldoStatus(balanceInfo.balance, balanceInfo.balanceType);

      // 3. Hitung breakdown result
      const breakdown = buildResultBreakdown(config, campInsights);

      // 4. Hitung purchase metrics (jika diaktifkan)
      const purchaseMetrics = (config.purchase_metrics && acctInsights)
        ? getPurchaseMetrics(acctInsights)
        : null;

      // 5. Simpan ke db
      const spend = parseFloat(acctInsights?.spend ?? "0");
      const actionsMap: Record<string, number> = {};
      for (const a of acctInsights?.actions ?? []) actionsMap[a.action_type] = parseFloat(a.value);
      const linkClicks = Math.round(actionsMap["link_click"] ?? 0);
      const cpcManual = linkClicks > 0 ? spend / linkClicks : 0;

      // fb_act_daily_data
      await db.insert(fbActDailyData).values({
        fbActId: act.id,
        actId: act.actId,
        date: yesterdayStr,
        balance: String(balanceInfo.balance),
        amountSpent: balanceData.amount_spent ? String(parseInt(balanceData.amount_spent) / 100) : null,
        spendCap: balanceData.spend_cap ? String(parseInt(balanceData.spend_cap) / 100) : null,
        effectiveBalance: String(balanceInfo.balance),
        balanceType: balanceInfo.balanceType,
        spendingLimit: balanceInfo.spendingLimit ? String(balanceInfo.spendingLimit) : null,
        outstandingBalance: balanceInfo.outstandingBalance ? String(balanceInfo.outstandingBalance) : null,
        statusLevel: balanceInfo.balance <= 0 ? 2 : balanceInfo.balance < THRESHOLD_CRITICAL ? 2 : balanceInfo.balance < THRESHOLD_WARNING ? 1 : 0,
        warningMessage: warningMsg ?? null,
        spend: acctInsights ? String(spend) : null,
        impressions: acctInsights ? parseInt(acctInsights.impressions ?? "0") : null,
        reach: acctInsights ? parseInt(acctInsights.reach ?? "0") : null,
        frequency: acctInsights ? String(parseFloat(acctInsights.frequency ?? "0")) : null,
        linkClicks: linkClicks || null,
        ctr: acctInsights ? String(parseFloat(acctInsights.ctr ?? "0")) : null,
        cpm: acctInsights ? String(parseFloat(acctInsights.cpm ?? "0")) : null,
        cpc: linkClicks ? String(cpcManual) : null,
        dataJson: { accountName } as any,
      }).onDuplicateKeyUpdate({
        set: {
          balance: String(balanceInfo.balance),
          effectiveBalance: String(balanceInfo.balance),
          balanceType: balanceInfo.balanceType,
          spendingLimit: balanceInfo.spendingLimit ? String(balanceInfo.spendingLimit) : null,
          outstandingBalance: balanceInfo.outstandingBalance ? String(balanceInfo.outstandingBalance) : null,
          statusLevel: balanceInfo.balance <= 0 ? 2 : balanceInfo.balance < THRESHOLD_CRITICAL ? 2 : balanceInfo.balance < THRESHOLD_WARNING ? 1 : 0,
          warningMessage: warningMsg ?? null,
          spend: acctInsights ? String(spend) : null,
          impressions: acctInsights ? parseInt(acctInsights.impressions ?? "0") : null,
          reach: acctInsights ? parseInt(acctInsights.reach ?? "0") : null,
          frequency: acctInsights ? String(parseFloat(acctInsights.frequency ?? "0")) : null,
          linkClicks: linkClicks || null,
          ctr: acctInsights ? String(parseFloat(acctInsights.ctr ?? "0")) : null,
          cpm: acctInsights ? String(parseFloat(acctInsights.cpm ?? "0")) : null,
          cpc: linkClicks ? String(cpcManual) : null,
        },
      });

      // fb_act_campaign_daily_insights
      for (const camp of campInsights) {
        if (!camp.campaign_id) continue;
        const campSpend = parseFloat(camp.spend ?? "0");
        const campActions = normalizeActions(camp.actions ?? []);
        const campLinkClicks = Math.round(campActions["link_click"] ?? 0);
        const trafficKws = config.keyword_traffic ? config.keyword_traffic.split(/\s+/).filter(Boolean) : [];
        const isTraffic = trafficKws.length > 0 && trafficKws.some((kw) => (camp.campaign_name ?? "").includes(kw));
        let resolvedPrimaryActionType: string | null = null;
        for (const at of Object.keys(campActions)) {
          if (PRIMARY_CONVERSION_TYPES.has(at) && campActions[at] > 0) {
            resolvedPrimaryActionType = at;
            break;
          }
        }

        await db.insert(fbActCampaignDailyInsights).values({
          fbActId: act.id,
          actId: act.actId,
          date: yesterdayStr,
          campaignId: camp.campaign_id,
          campaignName: camp.campaign_name ?? null,
          spend: campSpend ? String(campSpend) : null,
          linkClicks: campLinkClicks || null,
          isTrafficCampaign: isTraffic ? 1 : 0,
          resolvedPrimaryActionType,
          dataJson: { actions: camp.actions } as any,
        }).onDuplicateKeyUpdate({
          set: {
            campaignName: camp.campaign_name ?? null,
            spend: campSpend ? String(campSpend) : null,
            linkClicks: campLinkClicks || null,
            isTrafficCampaign: isTraffic ? 1 : 0,
            resolvedPrimaryActionType,
          },
        });
      }

      // fb_act_result_breakdown_daily
      for (const bd of breakdown) {
        await db.insert(fbActResultBreakdownDaily).values({
          fbActId: act.id,
          actId: act.actId,
          date: yesterdayStr,
          label: bd.label,
          resultType: 0,
          results: bd.results,
          spent: String(bd.spent),
          totalPurchase: purchaseMetrics?.totalPurchase ?? null,
          purchaseValue: purchaseMetrics ? String(purchaseMetrics.purchaseValue) : null,
          costPerPurchase: purchaseMetrics ? String(purchaseMetrics.costPerPurchase) : null,
          roas: purchaseMetrics ? String(purchaseMetrics.roas) : null,
          dataJson: { cpr: bd.cpr, emoji: bd.emoji } as any,
        }).onDuplicateKeyUpdate({
          set: {
            results: bd.results,
            spent: String(bd.spent),
            totalPurchase: purchaseMetrics?.totalPurchase ?? null,
            purchaseValue: purchaseMetrics ? String(purchaseMetrics.purchaseValue) : null,
            costPerPurchase: purchaseMetrics ? String(purchaseMetrics.costPerPurchase) : null,
            roas: purchaseMetrics ? String(purchaseMetrics.roas) : null,
          },
        });
      }

      // 6. Kirim Telegram
      const message = buildMessage({
        accountName,
        tanggalData,
        tanggalReport,
        balanceInfo,
        statusEmoji,
        warningMsg,
        acctInsights,
        breakdown,
        purchaseMetrics,
      });

      const mainChatId = config.telegram_chat_id ?? telegramChatId;
      await sendTelegram(message, mainChatId, telegramBotToken);

      await db.insert(fbActNotificationsLog).values({
        fbActId: act.id,
        actId: act.actId,
        date: yesterdayStr,
        type: "main",
        dataJson: { chatId: mainChatId, accountName } as any,
      });

      // Extra Telegram group
      if (config.extra_telegram_chat_id) {
        await sendTelegram(message, config.extra_telegram_chat_id, telegramBotToken);
        await db.insert(fbActNotificationsLog).values({
          fbActId: act.id,
          actId: act.actId,
          date: yesterdayStr,
          type: "extra",
          dataJson: { chatId: config.extra_telegram_chat_id, accountName } as any,
        });
        console.log(`  [${i + 1}] Also sent to extra group (${config.extra_telegram_chat_id})`);
      }

      console.log(`  [${i + 1}] OK — ${accountName} | Saldo: ${formatIdr(balanceInfo.balance)} [${balanceInfo.balanceType}]`);
      success++;
    } catch (e: any) {
      console.error(`  [${i + 1}] GAGAL — ${actIdFull}:`, e.message ?? e);
      failed++;

      const errMsg = [
        "📊 <b>Laporan Meta Ads Harian</b>",
        "━━━━━━━━━━━━━━━━━━",
        `🆔 <code>${actIdFull}</code>`,
        `❌ Gagal mengambil data: ${String(e.message ?? e)}`,
      ].join("\n");

      try {
        const mainChatId = config.telegram_chat_id ?? telegramChatId;
        await sendTelegram(errMsg, mainChatId, telegramBotToken);
        if (config.extra_telegram_chat_id) {
          await sendTelegram(errMsg, config.extra_telegram_chat_id, telegramBotToken);
        }
      } catch (telErr) {
        console.error(`  [${i + 1}] Also failed to send error Telegram:`, telErr);
      }

      try {
        await db.insert(fbActNotificationsLog).values({
          fbActId: act.id,
          actId: act.actId,
          date: yesterdayStr,
          type: "error",
          dataJson: { error: String(e.message ?? e) } as any,
        });
      } catch {}
    }
  }

  // Update report run stats
  if (runId) {
    await db.update(fbActReportRuns).set({
      finishedAt: new Date(),
      accountsTotal: total,
      accountsSuccess: success,
      accountsFailed: failed,
    }).where(eq(fbActReportRuns.id, runId));
  }

  console.log(`[MetaAdsJob] Selesai: ${success}/${total} sukses, ${failed} gagal`);
}
