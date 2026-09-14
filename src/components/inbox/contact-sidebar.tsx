"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag, Conversation } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  User,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { avatarColor, initialsOf } from "@/components/dashboard/clinic-widgets";
import { conversationState } from "@/components/inbox/conversation-list";
import Link from "next/link";

interface ContactSidebarProps {
  contact: Contact | null;
  /** The open thread — drives the "Conversation" details block. */
  conversation?: Conversation | null;
}

interface NextAppointment {
  id: string;
  starts_at: string;
  service: string;
  status: string;
  source: string;
  doctor: { name: string } | null;
}

export function ContactSidebar({ contact, conversation }: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");
  const tState = useTranslations("Inbox.state");

  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [nextAppt, setNextAppt] = useState<NextAppointment | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Next upcoming appointment for the reference "Appointment" block.
    void supabase
      .from("appointments")
      .select("id, starts_at, service, status, source, doctor:doctors(name)")
      .eq("contact_id", contact.id)
      .gte("starts_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setNextAppt(null);
        const doc = data.doctor as unknown as { name: string }[] | { name: string } | null;
        setNextAppt({
          ...(data as Omit<NextAppointment, "doctor">),
          doctor: Array.isArray(doc) ? (doc[0] ?? null) : doc,
        });
      });

    // Fetch deals, notes, and tags in parallel
    const [dealsRes, notesRes, tagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  if (!contact) {
    return (
      <div className="flex h-full w-[300px] items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = initialsOf(displayName);
  const apptTime = nextAppt
    ? new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(nextAppt.starts_at))
    : null;
  const state = conversation ? conversationState(conversation) : null;

  return (
    <div className="flex h-full w-[300px] flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-5">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div
              className="flex size-12 items-center justify-center overflow-hidden rounded-full text-[15px] font-bold text-white"
              style={{ background: avatarColor(contact.id) }}
            >
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="size-12 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-2 text-[15px] font-semibold text-foreground">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-[11px] text-muted-foreground">{contact.company}</p>
            )}
          </div>

          {/* Appointment block (reference) */}
          <div className="mt-4">
            <span className="text-[11.5px] font-bold tracking-[0.06em] text-muted-foreground/80 uppercase">
              {tSidebar("appointment")}
            </span>
            {nextAppt ? (
              <div className="mt-2.5 rounded-[10px] bg-mint p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{apptTime}</span>
                  {nextAppt.source === "ai" ? (
                    <span className="inline-flex h-[22px] items-center rounded-full bg-info-bg px-2.5 text-[11.5px] font-semibold text-info-fg">
                      {tSidebar("bookedByAi")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-teal-700">
                  {nextAppt.service}
                  {nextAppt.doctor ? ` · ${nextAppt.doctor.name}` : ""}
                </p>
                <div className="mt-2.5 flex gap-1.5">
                  <Link
                    href="/appointments"
                    className="inline-flex h-8 items-center rounded-lg border border-input bg-card px-3 text-[12.5px] font-semibold text-foreground hover:bg-sunken"
                  >
                    {tSidebar("openCalendar")}
                  </Link>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{tSidebar("noAppointment")}</p>
            )}
          </div>

          {/* Conversation details (reference) */}
          {conversation && state ? (
            <div className="mt-4">
              <span className="text-[11.5px] font-bold tracking-[0.06em] text-muted-foreground/80 uppercase">
                {tSidebar("conversation")}
              </span>
              <div className="mt-2.5 flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{tSidebar("handledBy")}</span>
                  <span className="font-semibold text-foreground">
                    {state === "ai" ? tSidebar("clinicoroAi") : tSidebar("staff")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{tSidebar("stateLabel")}</span>
                  <span className="font-semibold text-foreground">{tState(state)}</span>
                </div>
                {conversation.ai_handoff_summary ? (
                  <p className="rounded-lg bg-warn-bg px-2.5 py-2 text-[11.5px] text-warn-fg">
                    {conversation.ai_handoff_summary}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Phone */}
          <div className="mt-4 space-y-1">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TagIcon className="h-3 w-3" />
              {tSidebar("tags")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{tSidebar("noTags")}</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              {tSidebar("deals")}
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{tSidebar("noDeals")}</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              {tSidebar("notes")}
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={tSidebar("addNotePlaceholder")}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
