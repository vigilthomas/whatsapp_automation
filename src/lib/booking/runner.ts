// ============================================================
// Booking assistant runner — the I/O around engine.ts.
//
// Called by the WhatsApp webhook for every inbound customer message,
// before Flows and automations. It returns `consumed: true` when the
// message belonged to a booking conversation (an ongoing one, a "bk:"
// button tap, or a trigger word), so the webhook skips the other bots.
//
// It never throws: a booking problem (including migration 053 not being
// run yet) is logged and the message falls through to Flows/automations.
// ============================================================

import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  engineSendInteractiveButtons,
  engineSendInteractiveList,
  engineSendText,
} from "@/lib/flows/meta-send";
import { continueBooking, startBooking, type BookingDeps, type BookingState, type Reply } from "./engine";
import { matchesKeyword, parseBookingConfig, withVocabulary } from "./settings";
import { parseVocabulary, resolveTerms } from "@/lib/vocabulary";
import { addDays, isFree, localDay, type Busy } from "./slots";
import { withClinic } from "./clinic";
import { parseClinicSettings } from "@/lib/clinic/settings";

/** A conversation left this long is forgotten; the next message starts fresh. */
export const SESSION_TIMEOUT_MS = 30 * 60_000;

export interface BookingInbound {
  accountId: string;
  /** Owner of the WhatsApp config — used for the sent messages' audit columns. */
  userId: string;
  contactId: string;
  conversationId: string;
  text?: string;
  replyId?: string;
}

export async function dispatchInboundToBooking(input: BookingInbound): Promise<{ consumed: boolean }> {
  try {
    return await run(input);
  } catch (err) {
    console.error("[booking] failed:", err);
    return { consumed: false };
  }
}

/**
 * The assistant's config narrowed to when the clinic is open (Settings →
 * Clinic, migration 060). Without that table or row it runs on its own
 * hours, as before. Scoped by account_id: this is the service-role client.
 */
async function clinicAware(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  config: ReturnType<typeof parseBookingConfig>,
): Promise<ReturnType<typeof parseBookingConfig>> {
  const { data, error } = await db.from("clinic_settings").select("config").eq("account_id", accountId).maybeSingle();
  if (error || !data) return config;
  const today = localDay(new Date(), config.timezone);
  // One extra day so a booking started just before midnight still sees tomorrow's closures.
  const days = Array.from({ length: config.daysAhead + 1 }, (_, i) => addDays(today, i));
  return withClinic(config, parseClinicSettings(data.config), days);
}

/** The install's business words (migration 064); the default sector before it. */
async function installTerms(db: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await db.from("app_branding").select("vocabulary").eq("id", 1).maybeSingle();
  return resolveTerms(parseVocabulary(error ? null : data?.vocabulary), process.env.NEXT_PUBLIC_APP_LOCALE || "en");
}

async function run(input: BookingInbound): Promise<{ consumed: boolean }> {
  const db = supabaseAdmin();
  const { accountId, contactId } = input;

  const { data: settings, error: settingsError } = await db
    .from("booking_settings")
    .select("enabled, config")
    .eq("account_id", accountId)
    .maybeSingle();
  if (settingsError || !settings?.enabled) return { consumed: false };
  const config = withVocabulary(
    await clinicAware(db, accountId, parseBookingConfig(settings.config)),
    await installTerms(db),
  );

  const { data: session } = await db
    .from("booking_sessions")
    .select("state, updated_at")
    .eq("account_id", accountId)
    .eq("contact_id", contactId)
    .maybeSingle();
  const live =
    session && Date.now() - Date.parse(session.updated_at as string) < SESSION_TIMEOUT_MS
      ? (session.state as BookingState)
      : null;

  const replyId = input.replyId?.startsWith("bk:") ? input.replyId : undefined;
  const text = input.text ?? "";
  // A tap on another bot's button while booking: leave it to that bot.
  if (live && input.replyId && !replyId) return { consumed: false };
  const starting = !live && (!!replyId || matchesKeyword(text, config.keywords));
  if (!live && !starting) return { consumed: false };

  const deps = await loadDeps(input, config);
  const result = live
    ? await continueBooking(live, { text, replyId }, deps)
    : await startBooking(deps);

  if (result.saveName) {
    await db
      .from("contacts")
      .update({ name: result.saveName })
      .eq("id", contactId)
      .eq("account_id", accountId)
      .or("name.is.null,name.eq.");
  }

  if (result.state) {
    await db.from("booking_sessions").upsert({
      account_id: accountId,
      contact_id: contactId,
      conversation_id: input.conversationId,
      state: result.state,
      updated_at: new Date().toISOString(),
    });
  } else if (session) {
    await db.from("booking_sessions").delete().eq("account_id", accountId).eq("contact_id", contactId);
  }

  for (const reply of result.replies) await send(input, reply);
  return { consumed: true };
}

/**
 * Everything the engine needs to find and book times for one contact.
 * Also used by the AI assistant (src/lib/ai-chat/runner.ts), which books
 * through the same `book` (re-checks the time right before saving).
 */
export async function loadDeps(
  input: Pick<BookingInbound, "accountId" | "contactId">,
  config: BookingDeps["config"],
): Promise<BookingDeps> {
  const db = supabaseAdmin();
  const { accountId, contactId } = input;
  const [services, doctors, contact] = await Promise.all([
    db
      .from("services")
      .select("id, name, duration_min, buffer_min")
      .eq("account_id", accountId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name"),
    db
      .from("doctors")
      .select("id, name, branch_id, user_id")
      .eq("account_id", accountId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name"),
    db.from("contacts").select("name").eq("id", contactId).eq("account_id", accountId).maybeSingle(),
  ]);

  // Doctor services and leaves (055). Missing tables (055 not run yet)
  // simply mean "no links, nobody on leave".
  const today = new Date().toISOString().slice(0, 10);
  // duration_min arrives with 057; before that, fall back to the links alone.
  const linkQuery = (cols: string) =>
    db.from("doctor_services").select(cols).eq("account_id", accountId).eq("is_active", true).is("deleted_at", null);
  const [linksWithTime, leaveRows] = await Promise.all([
    linkQuery("doctor_id, service_id, duration_min"),
    db
      .from("user_leaves")
      .select("user_id, starts_on, ends_on, leave_type, late_minutes")
      .eq("account_id", accountId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .gte("ends_on", today),
  ]);
  const links = linksWithTime.error ? await linkQuery("doctor_id, service_id") : linksWithTime;
  const doctorOfUser = new Map(
    (doctors.data ?? []).filter((d) => d.user_id).map((d) => [d.user_id as string, d.id as string]),
  );
  const leaves = (leaveRows.error ? [] : (leaveRows.data ?? []))
    .filter((l) => doctorOfUser.has(l.user_id as string))
    .map((l) => ({
      doctor_id: doctorOfUser.get(l.user_id as string)!,
      starts_on: String(l.starts_on),
      ends_on: String(l.ends_on),
      leave_type: ((l as { leave_type?: string }).leave_type ?? "full") as "full" | "half_am" | "half_pm" | "late",
      late_minutes: (l as { late_minutes?: number | null }).late_minutes ?? null,
    }));
  const bufferOf = new Map((services.data ?? []).map((s) => [s.name as string, Number(s.buffer_min) || 0]));

  const busy = async (from: Date, to: Date): Promise<Busy[]> => {
    const { data, error } = await db
      .from("appointments")
      .select("doctor_id, starts_at, ends_at, service")
      .eq("account_id", accountId)
      .neq("status", "cancelled")
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString());
    if (error) throw error;
    // Each booking keeps its own service's buffer around it.
    return (data ?? []).map((a) => ({
      doctor_id: a.doctor_id as string | null,
      starts_at: a.starts_at as string,
      ends_at: a.ends_at as string,
      buffer_min: bufferOf.get(a.service as string) ?? 0,
    }));
  };

  return {
    config,
    services: services.data ?? [],
    doctors: doctors.data ?? [],
    doctorServices: links.error
      ? []
      : ((links.data ?? []) as unknown as { doctor_id: string; service_id: string; duration_min?: number | null }[]),
    leaves,
    contactName: (contact.data?.name as string | null)?.trim() || null,
    now: new Date(),
    busy,
    book: async (b) => {
      // Re-check right before saving: someone may have taken it meanwhile.
      const around = new Date(b.startsAt.getTime() - 4 * 3_600_000);
      const after = new Date(b.endsAt.getTime() + 4 * 3_600_000);
      if (b.doctorId && !isFree(b.doctorId, b.startsAt, b.endsAt, await busy(around, after), b.bufferMin)) {
        return "taken";
      }
      const { error } = await db.from("appointments").insert({
        account_id: accountId,
        contact_id: contactId,
        branch_id: b.branchId,
        doctor_id: b.doctorId,
        service: b.serviceName,
        starts_at: b.startsAt.toISOString(),
        ends_at: b.endsAt.toISOString(),
        status: "scheduled",
        source: "whatsapp",
        notes: b.notes,
      });
      if (error) throw error;
      return "ok";
    },
  };
}

async function send(input: BookingInbound, reply: Reply): Promise<void> {
  const base = {
    accountId: input.accountId,
    userId: input.userId,
    conversationId: input.conversationId,
    contactId: input.contactId,
  };
  if (reply.kind === "text") {
    await engineSendText({ ...base, text: reply.text });
  } else if (reply.kind === "buttons") {
    await engineSendInteractiveButtons({ ...base, bodyText: reply.body, buttons: reply.buttons });
  } else {
    await engineSendInteractiveList({
      ...base,
      bodyText: reply.body,
      buttonLabel: reply.button,
      sections: [{ rows: reply.rows }],
    });
  }
}
