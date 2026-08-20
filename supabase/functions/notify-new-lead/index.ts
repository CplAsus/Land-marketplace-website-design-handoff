import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Lead = {
  id: string;
  listing_title: string;
  customer_name: string;
  phone: string;
  line_id: string | null;
  request_type: "interest" | "appt" | "docs" | "report";
  appointment_date: string | null;
  message: string | null;
  requested_documents: string[];
  report_reason: string | null;
  source: string;
  status: string;
  email_notification_status: "pending" | "sending" | "sent" | "failed";
  email_notification_attempts: number;
  email_notification_sent_at: string | null;
  updated_at: string;
  created_at: string;
};

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const LEAD_SELECT = [
  "id",
  "listing_title",
  "customer_name",
  "phone",
  "line_id",
  "request_type",
  "appointment_date",
  "message",
  "requested_documents",
  "report_reason",
  "source",
  "status",
  "email_notification_status",
  "email_notification_attempts",
  "email_notification_sent_at",
  "updated_at",
  "created_at",
].join(",");

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function defaultKey(name: string) {
  const raw = Deno.env.get(name);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default || Object.values(parsed)[0] || "";
  } catch {
    return raw;
  }
}

function html(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function text(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function requestTypeLabel(value: Lead["request_type"]) {
  return {
    interest: "สนใจที่ดิน",
    appt: "ขอนัดดูแปลง",
    docs: "ขอเอกสาร",
    report: "แจ้งปัญหาประกาศ",
  }[value] || "สนใจที่ดิน";
}

function thaiDate(value: string | null, withTime = false) {
  if (!value) return "ไม่ได้ระบุ";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "long",
      ...(withTime ? { timeStyle: "short" as const } : {}),
      timeZone: "Asia/Bangkok",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

async function safeSecretMatch(actual: string | null, expected: string) {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const av = new Uint8Array(a), bv = new Uint8Array(b);
  let mismatch = av.length ^ bv.length;
  for (let i = 0; i < Math.max(av.length, bv.length); i += 1) {
    mismatch |= (av[i] || 0) ^ (bv[i] || 0);
  }
  return mismatch === 0;
}

async function isAdminRequest(req: Request, supabaseUrl: string) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!publishableKey) return false;
  const client = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice(7);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) return false;
  const { data, error } = await client
    .from("site_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return !error && Boolean(data);
}

function emailHtml(lead: Lead) {
  const phoneDigits = lead.phone.replace(/\D/g, "");
  const documents = (lead.requested_documents || []).map(html).join(", ") || "ไม่ได้ระบุ";
  const rows = [
    ["ประเภทคำขอ", requestTypeLabel(lead.request_type)],
    ["ที่ดินที่สนใจ", lead.listing_title || "ไม่ได้ระบุแปลง"],
    ["ชื่อลูกค้า", lead.customer_name],
    ["เบอร์โทร", lead.phone],
    ["LINE ID", lead.line_id || "ไม่ได้ระบุ"],
    ["วันที่ขอนัดดู", lead.appointment_date ? thaiDate(`${lead.appointment_date}T00:00:00+07:00`) : "ไม่ได้ระบุ"],
    ["เอกสารที่ขอ", documents],
    ["เหตุผลที่แจ้ง", lead.report_reason || "ไม่ได้ระบุ"],
    ["ข้อความ", lead.message || "ไม่มีข้อความเพิ่มเติม"],
    ["เวลาที่ส่งข้อมูล", thaiDate(lead.created_at, true)],
  ];
  const table = rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;color:#687168;border-bottom:1px solid #e8e4db;width:34%;vertical-align:top">${html(label)}</td>
      <td style="padding:10px 12px;color:#17231c;border-bottom:1px solid #e8e4db;font-weight:600;vertical-align:top;white-space:pre-wrap">${html(value)}</td>
    </tr>`).join("");
  return `<!doctype html><html lang="th"><body style="margin:0;background:#f5f3ed;font-family:Tahoma,Arial,sans-serif;color:#17231c">
    <div style="max-width:640px;margin:0 auto;padding:28px 16px">
      <div style="background:#174b35;color:#fff;border-radius:16px 16px 0 0;padding:24px 26px">
        <div style="font-size:14px;opacity:.8">ทรายทองพัฒนา · ลูกค้าจากเว็บไซต์</div>
        <h1 style="margin:8px 0 0;font-size:26px">มีลูกค้าสนใจที่ดินรายใหม่</h1>
      </div>
      <div style="background:#fff;border-radius:0 0 16px 16px;padding:22px 20px 26px">
        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:16px">${table}</table>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">
          <a href="tel:${html(phoneDigits)}" style="display:inline-block;background:#174b35;color:#fff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700">โทรหาลูกค้า ${html(lead.phone)}</a>
          <a href="https://saithongptn.com/admin.html" style="display:inline-block;background:#e9a915;color:#17231c;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700">เปิดระบบจัดการ</a>
        </div>
        <p style="margin:22px 0 0;color:#7c827c;font-size:13px;line-height:1.6">ข้อมูลนี้ส่งจากแบบฟอร์มบน saithongptn.com กรุณาใช้เพื่อติดต่อกลับเรื่องที่ดินตามความยินยอมของลูกค้าเท่านั้น</p>
      </div>
    </div>
  </body></html>`;
}

function emailText(lead: Lead) {
  return [
    "ทรายทองพัฒนา — มีลูกค้าสนใจที่ดินรายใหม่",
    `ประเภท: ${requestTypeLabel(lead.request_type)}`,
    `ที่ดิน: ${text(lead.listing_title || "ไม่ได้ระบุแปลง")}`,
    `ชื่อ: ${text(lead.customer_name)}`,
    `โทร: ${text(lead.phone)}`,
    `LINE: ${text(lead.line_id || "ไม่ได้ระบุ")}`,
    `นัดดู: ${lead.appointment_date ? thaiDate(`${lead.appointment_date}T00:00:00+07:00`) : "ไม่ได้ระบุ"}`,
    `ข้อความ: ${text(lead.message || "ไม่มีข้อความเพิ่มเติม")}`,
    `เวลาส่ง: ${thaiDate(lead.created_at, true)}`,
    "จัดการลูกค้า: https://saithongptn.com/admin.html",
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const secretKey = defaultKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const webhookSecret = Deno.env.get("LEAD_WEBHOOK_SECRET") || "";
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  const recipient = Deno.env.get("LEAD_NOTIFICATION_TO") || "saithong.ptn@gmail.com";
  const sender = Deno.env.get("LEAD_NOTIFICATION_FROM") || "ทรายทองพัฒนา <onboarding@resend.dev>";

  if (!supabaseUrl || !secretKey) return json({ error: "server_database_config_missing" }, 503);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const webhookAuthorized = await safeSecretMatch(req.headers.get("x-webhook-secret"), webhookSecret);
  const adminAuthorized = webhookAuthorized ? false : await isAdminRequest(req, supabaseUrl);
  if (!webhookAuthorized && !adminAuthorized) return json({ error: "unauthorized" }, 401);

  const webhookRecord = body.record && typeof body.record === "object" ? body.record as Record<string, unknown> : null;
  const leadId = String(webhookRecord?.id || body.lead_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId)) {
    return json({ error: "invalid_lead_id" }, 400);
  }
  if (webhookAuthorized && (body.type !== "INSERT" || body.table !== "customer_leads" || body.schema !== "public")) {
    return json({ error: "invalid_webhook_event" }, 400);
  }
  if (!resendKey || !webhookSecret) return json({ error: "email_config_missing" }, 503);

  const service = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: lead, error: leadError } = await service
    .from("customer_leads")
    .select(LEAD_SELECT)
    .eq("id", leadId)
    .maybeSingle<Lead>();
  if (leadError) return json({ error: "lead_lookup_failed" }, 500);
  if (!lead) return json({ error: "lead_not_found" }, 404);
  if (lead.email_notification_status === "sent") return json({ ok: true, already_sent: true });

  if (lead.email_notification_status === "sending") {
    const stale = Date.now() - new Date(lead.updated_at).getTime() > 10 * 60 * 1000;
    if (!stale) return json({ ok: true, processing: true }, 202);
    await service.from("customer_leads").update({ email_notification_status: "failed", email_notification_error: "stale_delivery_recovered" }).eq("id", lead.id);
  }

  const { data: claimed, error: claimError } = await service
    .from("customer_leads")
    .update({
      email_notification_status: "sending",
      email_notification_attempts: Number(lead.email_notification_attempts || 0) + 1,
      email_notification_error: null,
    })
    .eq("id", lead.id)
    .in("email_notification_status", ["pending", "failed"])
    .select("id")
    .maybeSingle();
  if (claimError) return json({ error: "claim_failed" }, 500);
  if (!claimed) return json({ ok: true, processing: true }, 202);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `lead-${lead.id}`,
      },
      body: JSON.stringify({
        from: sender,
        to: [recipient],
        reply_to: "saithong.ptn@gmail.com",
        subject: `ลูกค้าใหม่: ${text(lead.customer_name)} สนใจ ${text(lead.listing_title || "ที่ดิน")}`.slice(0, 180),
        html: emailHtml(lead),
        text: emailText(lead),
      }),
    });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(result.message || `email_provider_${response.status}`));

    await service.from("customer_leads").update({
      email_notification_status: "sent",
      email_notification_sent_at: new Date().toISOString(),
      email_notification_error: null,
      email_notification_provider_id: String(result.id || ""),
    }).eq("id", lead.id);
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "email_send_failed";
    await service.from("customer_leads").update({
      email_notification_status: "failed",
      email_notification_error: message.slice(0, 500),
    }).eq("id", lead.id);
    return json({ error: "email_send_failed" }, 502);
  }
});
