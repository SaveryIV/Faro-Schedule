"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addMonths } from "date-fns";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
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
  officeDayKey,
  officeLocalInputValue,
  officeLocalToUtc,
} from "@/lib/tz";

type SpaceOption = { id: string; name: string; slug: string };
type Frequency = "WEEKLY" | "MONTHLY";

const FREQ_SENTENCE: Record<Frequency, string> = {
  WEEKLY: "Esta reserva se repite cada semana.",
  MONTHLY: "Esta reserva se repite cada mes.",
};

const SPACE_DOT: Record<string, string> = {
  hall: "bg-sky-500",
  "meeting-room": "bg-violet-500",
};

const MOBILE_QUERY = "(max-width: 767px)";

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
      seriesId: string | null;
      seriesFrequency: Frequency | null;
    };

export function CalendarView({ spaces }: { spaces: SpaceOption[] }) {
  const calendarRef = useRef<FullCalendar>(null);
  const spaceRef = useRef<string>("");
  const [activeSpace, setActiveSpace] = useState<string>("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Live-sync bookkeeping.
  const lastSigRef = useRef<string | null>(null);
  const mutatingRef = useRef(false);

  useEffect(() => setMounted(true), []);

  // Match the calendar view to the screen: a 3-day strip on phones, the full
  // week on larger screens. Switches live on rotate / resize.
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const apply = () => {
      setIsMobile(mql.matches);
      calendarRef.current
        ?.getApi()
        .changeView(mql.matches ? "timeGridThreeDay" : "timeGridWeek");
    };
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [mounted]);

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
      const url = `/api/appointments?${params.toString()}`;

      // Retry a couple of times: the first request after the database has
      // scaled to zero can fail while it wakes, and FullCalendar does not
      // retry a failed event source on its own.
      const load = (retriesLeft: number): Promise<void> =>
        fetch(url)
          .then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("Could not load bookings")),
          )
          .then((data: EventInput[]) => {
            lastSigRef.current = signatureOf(data);
            success(data);
          })
          .catch((err: Error) => {
            if (retriesLeft > 0) {
              return new Promise<void>((res) =>
                setTimeout(() => res(load(retriesLeft - 1)), 1500),
              );
            }
            failure(err);
          });

      void load(2);
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
        if (known === null) {
          // We never got a good baseline (initial load failed) — repaint
          // quietly so a cold-start empty grid recovers.
          api.refetchEvents();
        } else if (sig !== known) {
          api.refetchEvents();
          setToast({ text: "Calendario actualizado", kind: "info" });
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
    // Month view: a tap drills into that day.
    if (arg.view.type === "dayGridMonth") {
      calendarRef.current?.getApi().changeView("timeGridDay", arg.date);
      return;
    }
    // Time views: a single tap/click on an empty slot starts a booking
    // (defaulting to one hour) — no drag needed, which is awkward on phones.
    const start = arg.date;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setDialog({ mode: "create", start, end });
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
      seriesId: e.extendedProps.seriesId ?? null,
      seriesFrequency: (e.extendedProps.seriesFrequency as Frequency | null) ?? null,
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
        <div className="truncate text-[9px] font-semibold opacity-75">
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
      <div className="hidden items-center justify-between gap-3 sm:flex">
        <h1 className="text-xl font-bold tracking-tight">Calendario</h1>
        <p className="hidden text-xs text-stone-500 lg:block">
          Tocá un espacio libre para reservar, o una reserva para cambiar el horario
        </p>
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pt-1 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pt-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => selectSpace("")}
          className={chipClass(activeSpace === "")}
        >
          Todos los espacios
        </button>
        {spaces.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => selectSpace(s.slug)}
            className={chipClass(activeSpace === s.slug)}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${SPACE_DOT[s.slug] ?? "bg-stone-400"}`}
            />
            {s.name}
          </button>
        ))}
      </div>

      {toast && (
        <p
          role="status"
          className={
            "rounded-lg px-3 py-2 text-sm " +
            (toast.kind === "info"
              ? "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300")
          }
        >
          {toast.text}
        </p>
      )}

      <div className="fc-faro -mx-4 border-y border-stone-200 bg-white p-1.5 sm:mx-0 sm:rounded-xl sm:border sm:p-2 dark:border-stone-800 dark:bg-stone-900">
        {mounted ? (
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
            locale={esLocale}
            initialView={
              typeof window !== "undefined" &&
              window.matchMedia(MOBILE_QUERY).matches
                ? "timeGridThreeDay"
                : "timeGridWeek"
            }
            views={{
              timeGridThreeDay: {
                type: "timeGrid",
                duration: { days: 3 },
              },
            }}
            headerToolbar={
              isMobile
                ? { left: "prev,next", center: "title", right: "today" }
                : {
                    left: "prev,next today",
                    center: "title",
                    right: "timeGridWeek,timeGridDay,dayGridMonth",
                  }
            }
            titleFormat={
              isMobile
                ? { month: "short", day: "numeric" }
                : { month: "short", day: "numeric", year: "numeric" }
            }
            buttonText={{
              today: "Hoy",
              week: "Semana",
              day: "Día",
              month: "Mes",
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
          <div className="h-[600px] animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800" />
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
          onDone={(info) => {
            setDialog(null);
            refresh();
            if (info) setToast({ text: info, kind: "info" });
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
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition " +
    (active
      ? "border-transparent bg-stone-900 text-white dark:bg-white dark:text-stone-900"
      : "border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800")
  );
}

// ---------------------------------------------------------------------------

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-up flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl sm:border sm:border-stone-200 dark:bg-stone-900 dark:sm:border-stone-800"
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4 dark:border-stone-800">
          <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// text-base (16px) keeps iOS Safari from auto-zooming when a field is focused.
const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-beam-500 dark:border-stone-700 dark:bg-stone-950";

const primaryButton =
  "inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:opacity-60 sm:w-auto dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200";

const secondaryButton =
  "inline-flex min-h-[44px] w-full items-center justify-center rounded-lg px-4 text-sm font-medium text-stone-600 transition hover:bg-stone-100 sm:w-auto dark:text-stone-300 dark:hover:bg-stone-800";

const errorBox =
  "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300";

const fieldLabel = "text-sm font-medium text-stone-600 dark:text-stone-300";

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
  onDone: (info?: string) => void;
}) {
  const initialSpace =
    spaces.find((s) => s.slug === defaultSpaceSlug)?.id ?? spaces[0]?.id ?? "";
  const [spaceId, setSpaceId] = useState(initialSpace);
  const [title, setTitle] = useState("");
  const [startStr, setStartStr] = useState(officeLocalInputValue(start));
  const [endStr, setEndStr] = useState(officeLocalInputValue(end));
  const [frequency, setFrequency] = useState<"" | Frequency>("");
  const [repeatUntil, setRepeatUntil] = useState(() =>
    officeDayKey(addMonths(start, 3)),
  );
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
        frequency: frequency || undefined,
        repeatUntil: frequency ? repeatUntil : undefined,
      }),
    );
    setPending(false);
    if ("ok" in res && res.ok) {
      let info: string | undefined;
      if (res.made && res.made > 1) {
        info = `Se crearon ${res.made} reservas.`;
        if (res.skipped) {
          info += ` Se ${res.skipped === 1 ? "omitió 1 fecha" : `omitieron ${res.skipped} fechas`} por superposición.`;
        }
      }
      onDone(info);
    } else {
      setError((res as { error: string }).error);
      // Surface the booking that blocked us, behind the dialog.
      onConflict();
    }
  }

  return (
    <Modal title="Nueva reserva" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <p className={errorBox}>{error}</p>}
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Espacio</span>
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
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Título</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            placeholder="¿Para qué es la sala?"
            className={inputClass}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Inicio</span>
            <input
              type="datetime-local"
              step={60}
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              required
              className={inputClass}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Fin</span>
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
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Repetición</span>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as "" | Frequency)}
            className={inputClass}
          >
            <option value="">No se repite</option>
            <option value="WEEKLY">Cada semana</option>
            <option value="MONTHLY">Cada mes</option>
          </select>
        </label>
        {frequency && (
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Repetir hasta</span>
            <input
              type="date"
              value={repeatUntil}
              min={startStr.slice(0, 10)}
              onChange={(e) => setRepeatUntil(e.target.value)}
              required
              className={inputClass}
            />
          </label>
        )}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Guardando…" : frequency ? "Crear reservas" : "Crear reserva"}
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

  const isSeries = Boolean(dialog.seriesId);
  const [scope, setScope] = useState<"one" | "series">("one");
  const showScope = isSeries && (dialog.canMove || dialog.canDelete);

  async function saveTime(e: React.FormEvent) {
    e.preventDefault();
    setSavingTime(true);
    setTimeError(null);
    const res = await runMutation(() =>
      moveBooking({
        id: dialog.id,
        startISO: officeLocalToUtc(startStr).toISOString(),
        endISO: officeLocalToUtc(endStr).toISOString(),
        scope: isSeries ? scope : undefined,
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
    const res = await runMutation(() =>
      cancelBooking(dialog.id, isSeries ? scope : "one"),
    );
    setPending(false);
    if ("ok" in res && res.ok) onCancelled();
    else onError((res as { error: string }).error);
  }

  return (
    <Modal title={dialog.title} onClose={onClose}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-stone-500">Espacio</dt>
        <dd className="font-medium">{dialog.spaceName}</dd>
        <dt className="text-stone-500">Cuándo</dt>
        <dd>
          {formatOffice(dialog.start)} – {formatOffice(dialog.end)}
        </dd>
        <dt className="text-stone-500">Reservado por</dt>
        <dd>{dialog.bookedBy}</dd>
      </dl>

      {isSeries && dialog.seriesFrequency && (
        <p className="mt-3 text-xs text-stone-500">
          {FREQ_SENTENCE[dialog.seriesFrequency]}
        </p>
      )}

      {showScope && (
        <div className="mt-4 flex rounded-lg border border-stone-300 p-0.5 text-sm dark:border-stone-700">
          {(
            [
              ["one", "Solo esta reserva"],
              ["series", "Toda la serie"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={
                "flex-1 rounded-md px-3 py-1.5 font-medium transition " +
                (scope === value
                  ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                  : "text-stone-600 dark:text-stone-300")
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {dialog.canMove && (
        <form
          onSubmit={saveTime}
          className="mt-5 space-y-3 border-t border-stone-200 pt-5 dark:border-stone-800"
        >
          {timeError && <p className={errorBox}>{timeError}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className={fieldLabel}>Inicio</span>
              <input
                type="datetime-local"
                step={60}
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                required
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <span className={fieldLabel}>Fin</span>
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
          <button type="submit" disabled={savingTime} className={primaryButton}>
            {savingTime
              ? "Guardando…"
              : isSeries && scope === "series"
                ? "Guardar horario de la serie"
                : "Guardar horario"}
          </button>
        </form>
      )}

      {!dialog.mine && (
        <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500 dark:bg-stone-800/60">
          {dialog.canDelete
            ? "Otra persona hizo esta reserva. Como administrador podés cancelarla, pero solo esa persona puede moverla."
            : "Otra persona hizo esta reserva. Solo esa persona puede cambiarla o cancelarla."}
        </p>
      )}

      {dialog.canDelete && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-800/70 dark:text-red-300 dark:hover:bg-red-950"
        >
          {pending
            ? "Cancelando…"
            : isSeries && scope === "series"
              ? "Cancelar toda la serie"
              : "Cancelar esta reserva"}
        </button>
      )}
    </Modal>
  );
}
