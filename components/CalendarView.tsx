"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  EventClickArg,
  EventChangeArg,
  DateSelectArg,
  EventContentArg,
  EventInput,
  EventSourceFuncArg,
} from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";

import {
  createBooking,
  moveBooking,
  cancelBooking,
} from "@/app/(app)/appointments/actions";
import {
  formatOffice,
  officeLocalInputValue,
  officeLocalToUtc,
} from "@/lib/tz";

type SpaceOption = { id: string; name: string; slug: string };

const SPACE_DOT: Record<string, string> = {
  hall: "bg-sky-500",
  "meeting-room": "bg-violet-500",
};

/** Poll the events endpoint this often to pick up other people's changes. */
const POLL_MS = 7_000;
/** Faster cadence while the "new booking" dialog is open — the window in which
 *  a stale calendar leads to a double-book. */
const POLL_MS_BOOKING = 3_000;

type Toast = { text: string; kind: "error" | "info" };

/** A stable fingerprint of the visible bookings, so a poll only forces a
 *  re-render (and a toast) when something actually changed. */
function signatureOf(events: EventInput[]) {
  return events
    .map((e) => `${e.id}|${e.start}|${e.end}|${e.title}`)
    .sort()
    .join("\n");
}

type Dialog =
  | { mode: "create"; start: Date; end: Date }
  | {
      mode: "view";
      id: string;
      title: string;
      start: Date;
      end: Date;
      spaceName: string;
      bookedBy: string;
      mine: boolean;
      canMove: boolean;
      canDelete: boolean;
    };

export function CalendarView({ spaces }: { spaces: SpaceOption[] }) {
  const calendarRef = useRef<FullCalendar>(null);
  const spaceRef = useRef<string>("");
  const [activeSpace, setActiveSpace] = useState<string>("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [mounted, setMounted] = useState(false);

  // Live-sync bookkeeping.
  const lastSigRef = useRef<string | null>(null);
  const mutatingRef = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === "info" ? 3000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /** Re-pull events from the server and re-baseline the live-sync signature so
   *  the next poll doesn't announce our own change as "Calendar updated". */
  const refresh = useCallback(() => {
    lastSigRef.current = null;
    calendarRef.current?.getApi().refetchEvents();
  }, []);

  /** Run a server-action mutation with the poll paused, so a refetch can't land
   *  mid-flight and fight an optimistic drag's revert(). */
  const runMutation = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      mutatingRef.current = true;
      try {
        return await fn();
      } finally {
        mutatingRef.current = false;
      }
    },
    [],
  );

  const selectSpace = useCallback(
    (slug: string) => {
      spaceRef.current = slug;
      setActiveSpace(slug);
      refresh();
    },
    [refresh],
  );

  const fetchEvents = useCallback(
    (
      info: EventSourceFuncArg,
      success: (events: EventInput[]) => void,
      failure: (error: Error) => void,
    ) => {
      const params = new URLSearchParams({
        start: info.startStr,
        end: info.endStr,
      });
      if (spaceRef.current) params.set("space", spaceRef.current);
      fetch(`/api/appointments?${params.toString()}`)
        .then((r) =>
          r.ok ? r.json() : Promise.reject(new Error("Could not load bookings")),
        )
        .then((data: EventInput[]) => {
          lastSigRef.current = signatureOf(data);
          success(data);
        })
        .catch(failure);
    },
    [],
  );

  // Live sync: poll the events endpoint and re-render when another client has
  // created, moved or cancelled a booking. Also fires immediately when the tab
  // regains focus (the "left it open for an hour" case).
  useEffect(() => {
    if (!mounted) return;

    const poll = async () => {
      if (document.hidden || mutatingRef.current) return;
      const api = calendarRef.current?.getApi();
      if (!api) return;

      const params = new URLSearchParams({
        start: api.view.activeStart.toISOString(),
        end: api.view.activeEnd.toISOString(),
      });
      if (spaceRef.current) params.set("space", spaceRef.current);

      try {
        const r = await fetch(`/api/appointments?${params.toString()}`);
        if (!r.ok) return;
        const data: EventInput[] = await r.json();
        const sig = signatureOf(data);
        const known = lastSigRef.current;
        lastSigRef.current = sig;
        if (known !== null && sig !== known) {
          api.refetchEvents();
          setToast({ text: "Calendar updated", kind: "info" });
        }
      } catch {
        // A dropped poll is harmless — the next one catches up.
      }
    };

    const interval = setInterval(
      poll,
      dialog?.mode === "create" ? POLL_MS_BOOKING : POLL_MS,
    );
    const onFocus = () => {
      if (!document.hidden) poll();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [mounted, dialog?.mode]);

  const handleSelect = useCallback((sel: DateSelectArg) => {
    setDialog({ mode: "create", start: sel.start, end: sel.end });
    calendarRef.current?.getApi().unselect();
  }, []);

  const handleDateClick = useCallback((arg: DateClickArg) => {
    if (arg.view.type === "dayGridMonth") {
      calendarRef.current?.getApi().changeView("timeGridDay", arg.date);
    }
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const e = arg.event;
    if (!e.start || !e.end) return;
    setDialog({
      mode: "view",
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      spaceName: e.extendedProps.spaceName,
      bookedBy: e.extendedProps.bookedBy,
      mine: Boolean(e.extendedProps.mine),
      canMove: Boolean(e.extendedProps.canMove),
      canDelete: Boolean(e.extendedProps.canDelete),
    });
  }, []);

  const handleEventChange = useCallback(
    async (arg: EventChangeArg) => {
      const e = arg.event;
      if (!e.start || !e.end) return;
      const res = await runMutation(() =>
        moveBooking({
          id: e.id,
          startISO: e.start!.toISOString(),
          endISO: e.end!.toISOString(),
        }),
      );
      if (!("ok" in res) || !res.ok) {
        setToast({ text: res.error, kind: "error" });
        arg.revert();
      } else {
        // Our own change — re-baseline so the poll stays quiet about it.
        lastSigRef.current = null;
      }
    },
    [runMutation],
  );

  const renderEvent = useCallback((arg: EventContentArg) => {
    const isMonth = arg.view.type === "dayGridMonth";
    if (isMonth) {
      return (
        <div className="flex items-center gap-1 overflow-hidden px-1">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: arg.event.backgroundColor }}
          />
          <span className="truncate text-[11px]">
            {arg.timeText} {arg.event.title}
          </span>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col gap-px overflow-hidden px-1.5 py-0.5 leading-tight">
        <div className="truncate text-[9px] font-semibold uppercase tracking-wide opacity-70">
          {arg.event.extendedProps.spaceName}
        </div>
        <div className="truncate text-[12px] font-semibold">{arg.event.title}</div>
        <div className="truncate text-[10px] opacity-80">
          {arg.timeText} · {arg.event.extendedProps.bookedBy}
        </div>
      </div>
    );
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => selectSpace("")}
          className={chipClass(activeSpace === "")}
        >
          All spaces
        </button>
        {spaces.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => selectSpace(s.slug)}
            className={chipClass(activeSpace === s.slug)}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${SPACE_DOT[s.slug] ?? "bg-neutral-400"}`}
            />
            {s.name}
          </button>
        ))}
        <span className="ml-auto hidden text-xs text-neutral-500 sm:inline">
          Drag an empty slot to book · click a booking to retime it
        </span>
      </div>

      {toast && (
        <p
          className={
            "rounded-md px-3 py-2 text-sm " +
            (toast.kind === "info"
              ? "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300")
          }
        >
          {toast.text}
        </p>
      )}

      <div className="fc-faro rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
        {mounted ? (
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "timeGridWeek,timeGridDay,dayGridMonth",
            }}
            buttonText={{
              today: "Today",
              week: "Week",
              day: "Day",
              month: "Month",
            }}
            firstDay={1}
            nowIndicator
            allDaySlot={false}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            scrollTime="07:30:00"
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            expandRows
            height="auto"
            stickyHeaderDates
            dayMaxEvents={3}
            selectable
            selectMirror
            selectMinDistance={2}
            longPressDelay={300}
            editable
            eventResizableFromStart
            eventDurationEditable
            slotEventOverlap={false}
            eventMinHeight={30}
            eventShortHeight={44}
            slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            events={fetchEvents}
            select={handleSelect}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            eventChange={handleEventChange}
            eventContent={renderEvent}
          />
        ) : (
          <div className="h-[600px] animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
        )}
      </div>

      {dialog?.mode === "create" && (
        <BookingDialog
          spaces={spaces}
          defaultSpaceSlug={activeSpace}
          start={dialog.start}
          end={dialog.end}
          runMutation={runMutation}
          onClose={() => setDialog(null)}
          onConflict={refresh}
          onDone={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}

      {dialog?.mode === "view" && (
        <EventDialog
          dialog={dialog}
          runMutation={runMutation}
          onClose={() => setDialog(null)}
          onConflict={refresh}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
          onCancelled={() => {
            setDialog(null);
            refresh();
          }}
          onError={(m) => setToast({ text: m, kind: "error" })}
        />
      )}
    </div>
  );
}

type RunMutation = <T>(fn: () => Promise<T>) => Promise<T>;

function chipClass(active: boolean) {
  return (
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition border-neutral-300 dark:border-neutral-700 " +
    (active
      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
      : "hover:bg-neutral-100 dark:hover:bg-neutral-800")
  );
}

// ---------------------------------------------------------------------------

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950";

function BookingDialog({
  spaces,
  defaultSpaceSlug,
  start,
  end,
  runMutation,
  onClose,
  onConflict,
  onDone,
}: {
  spaces: SpaceOption[];
  defaultSpaceSlug: string;
  start: Date;
  end: Date;
  runMutation: RunMutation;
  onClose: () => void;
  onConflict: () => void;
  onDone: () => void;
}) {
  const initialSpace =
    spaces.find((s) => s.slug === defaultSpaceSlug)?.id ?? spaces[0]?.id ?? "";
  const [spaceId, setSpaceId] = useState(initialSpace);
  const [title, setTitle] = useState("");
  const [startStr, setStartStr] = useState(officeLocalInputValue(start));
  const [endStr, setEndStr] = useState(officeLocalInputValue(end));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await runMutation(() =>
      createBooking({
        spaceId,
        title,
        startISO: officeLocalToUtc(startStr).toISOString(),
        endISO: officeLocalToUtc(endStr).toISOString(),
      }),
    );
    setPending(false);
    if ("ok" in res && res.ok) {
      onDone();
    } else {
      setError((res as { error: string }).error);
      // Surface the booking that blocked us, behind the dialog.
      onConflict();
    }
  }

  return (
    <Modal title="New booking" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-medium">Space</span>
          <select
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            className={inputClass}
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            placeholder="What is the room for?"
            className={inputClass}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Start</span>
            <input
              type="datetime-local"
              step={60}
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              required
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">End</span>
            <input
              type="datetime-local"
              step={60}
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              required
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {pending ? "Saving…" : "Create booking"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EventDialog({
  dialog,
  runMutation,
  onClose,
  onConflict,
  onSaved,
  onCancelled,
  onError,
}: {
  dialog: Extract<Dialog, { mode: "view" }>;
  runMutation: RunMutation;
  onClose: () => void;
  onConflict: () => void;
  onSaved: () => void;
  onCancelled: () => void;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [startStr, setStartStr] = useState(officeLocalInputValue(dialog.start));
  const [endStr, setEndStr] = useState(officeLocalInputValue(dialog.end));
  const [savingTime, setSavingTime] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);

  async function saveTime(e: React.FormEvent) {
    e.preventDefault();
    setSavingTime(true);
    setTimeError(null);
    const res = await runMutation(() =>
      moveBooking({
        id: dialog.id,
        startISO: officeLocalToUtc(startStr).toISOString(),
        endISO: officeLocalToUtc(endStr).toISOString(),
      }),
    );
    setSavingTime(false);
    if ("ok" in res && res.ok) {
      onSaved();
    } else {
      setTimeError((res as { error: string }).error);
      onConflict();
    }
  }

  async function remove() {
    setPending(true);
    const res = await runMutation(() => cancelBooking(dialog.id));
    setPending(false);
    if ("ok" in res && res.ok) onCancelled();
    else onError((res as { error: string }).error);
  }

  return (
    <Modal title={dialog.title} onClose={onClose}>
      <dl className="space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-neutral-500">Space</dt>
          <dd className="font-medium">{dialog.spaceName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-neutral-500">When</dt>
          <dd>
            {formatOffice(dialog.start)} – {formatOffice(dialog.end)}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-neutral-500">Booked by</dt>
          <dd>{dialog.bookedBy}</dd>
        </div>
      </dl>

      {dialog.canMove && (
        <form onSubmit={saveTime} className="mt-4 space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          {timeError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {timeError}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Start</span>
              <input
                type="datetime-local"
                step={60}
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                required
                className={inputClass}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">End</span>
              <input
                type="datetime-local"
                step={60}
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                required
                className={inputClass}
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingTime}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {savingTime ? "Saving…" : "Save time"}
            </button>
          </div>
        </form>
      )}

      {!dialog.mine && (
        <p className="mt-4 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-800/60">
          {dialog.canDelete
            ? "Someone else booked this. As an admin you can cancel it, but only they can move it."
            : "Someone else booked this. Only they can change or cancel it."}
        </p>
      )}

      {dialog.canDelete && (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
          >
            {pending ? "Cancelling…" : "Cancel this booking"}
          </button>
        </div>
      )}
    </Modal>
  );
}
