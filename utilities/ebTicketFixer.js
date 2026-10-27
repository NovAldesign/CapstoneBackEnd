import { isPlusOne, groupSize } from "./plusOne.js";

// ── Eventbrite ticket fixer (Admin) ──
// Puts the same ticket setup on every non-food event, through the Eventbrite API:
//   Early Bird 6 · General Admission 14 · Day Of 10 · Plus One 5 · Group of 5: 5 · Group of 10: 5  (45 total)
//   Day Of: on sale 11:30 PM the night before, ends 11:30 PM event day
//   GA, Plus One, groups: end 11:30 PM the night before. Early Bird end date is left alone.
// Guard rule: never set a quantity below what's already sold.
// plan() only reads. apply() works the plan out fresh, then makes the changes.

const API = "https://www.eventbriteapi.com/v3";
const TZ_DEFAULT = "America/New_York";

export const DAY_OF_DESC =
  "Day Of / door pricing. On sale from 11:30 PM the night before the event, online and at the door while seats last.";

export const DOOR_FAQ_Q = "Can I buy tickets at the door?";
export const DOOR_FAQ_A =
  "Yes, while seats last. Day Of tickets are $35, on sale from 11:30 PM the night before through doors, online and at the door. Plus One and group tickets end when Day Of pricing starts, so buy those ahead.";

const PRICES = {
  acoustic: { early: 25, ga: 30, dayof: 35, plusone: 52, group5: 120, group10: 225 },
  games:    { early: 20, ga: 25, dayof: 30, plusone: 42, group5: 100, group10: 187.5 },
};
const QTY = { early: 6, ga: 14, dayof: 10, plusone: 5, group5: 5, group10: 5 };
const CAPACITY = 45;
const LABEL = { early: "Early Bird", ga: "General Admission", dayof: "Day Of", plusone: "Plus One", group5: "Group of 5", group10: "Group of 10" };

// The 8 events. id null = find it on Eventbrite by date.
export const TARGETS = [
  { date: "2026-10-30", kind: "acoustic", id: "2000812012590", label: "Acoustic & Infused", verifyOnly: true },
  { date: "2026-11-06", kind: "acoustic", id: "2002450668855", label: "Acoustic & Infused" },
  { date: "2026-11-14", kind: "games",    id: "2000812385706", label: "Game Night" },
  { date: "2026-11-21", kind: "games",    id: "2001002510374", label: "Karaoke Bingo" },
  { date: "2026-11-28", kind: "games",    id: "2001001673872", label: "Game Night" },
  { date: "2026-12-04", kind: "acoustic", id: null, match: /acoustic/i, label: "Acoustic & Infused: Holiday Edition" },
  { date: "2026-12-12", kind: "games",    id: null, match: /game/i,     label: "Game Night" },
  { date: "2026-12-19", kind: "games",    id: null, match: /karaoke/i,  label: "Holiday Karaoke Bingo" },
];
// Never touched (food events)
const FOOD = /friendsgiving|syrian|feast|brunch|dinner/i;

const eb = async (path, token, opts = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error_description || body.error || `Eventbrite answered ${res.status}`;
    throw new Error(msg);
  }
  return body;
};

// ── Time helpers ──
const tzOffsetMs = (utcMs, tz) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - utcMs;
};
// Local wall time (YYYY-MM-DD, HH:MM) in tz → UTC ms
const localToUtc = (ymd, hm, tz) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, min] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return t;
};
const prevDay = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};
const ebUtc = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const sameMinute = (a, bMs) => a && Math.abs(Date.parse(a) - bMs) < 60 * 1000;
const show = (ms, tz) =>
  new Date(ms).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// ── Which slot is this ticket? ──
const slotOf = (name = "") => {
  if (/day\s*-?\s*of|door/i.test(name)) return "dayof";
  if (isPlusOne(name)) return "plusone";
  const g = groupSize(name);
  if (g === 10) return "group10";
  if (g === 5) return "group5";
  if (g) return null;
  if (/early/i.test(name)) return "early";
  if (/general|^\s*ga\b|admission/i.test(name)) return "ga";
  return null;
};

const money = (n) => `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;

// Find event ids that weren't given, by date, from the organizer's events
const findByDate = async (token, targets) => {
  const missing = targets.filter((t) => !t.id);
  if (!missing.length) return {};
  const me = await eb("/users/me/organizations/", token);
  const found = {};
  for (const org of me.organizations || []) {
    let page = 1;
    let more = true;
    while (more && page <= 10) {
      const body = await eb(`/organizations/${org.id}/events/?status=live,draft,started&time_filter=current_future&page_size=100&page=${page}`, token);
      for (const ev of body.events || []) {
        const day = String(ev.start?.local || "").slice(0, 10);
        for (const t of missing) {
          if (t.date === day && !FOOD.test(ev.name?.text || "") && (!t.match || t.match.test(ev.name?.text || ""))) {
            (found[t.date] ||= []).push({ id: ev.id, name: ev.name?.text });
          }
        }
      }
      more = Boolean(body.pagination?.has_more_items);
      page += 1;
    }
  }
  return found;
};

// Work out what one event needs
const planEvent = (t, ev) => {
  const tz = ev.start?.timezone || TZ_DEFAULT;
  const day = String(ev.start?.local || t.date).slice(0, 10);
  const nightBefore = localToUtc(prevDay(day), "23:30", tz);
  const eventDayEnd = localToUtc(day, "23:30", tz);
  const prices = PRICES[t.kind];
  const changes = [];
  const notes = [];
  const guards = [];

  if (FOOD.test(ev.name?.text || "")) {
    return { skip: true, notes: ["This looks like a food event, so nothing was changed."] };
  }

  // Event capacity
  if (ev.capacity && ev.capacity !== CAPACITY) {
    changes.push({ type: "capacity", from: ev.capacity, to: CAPACITY, text: `Event capacity ${ev.capacity} → ${CAPACITY}` });
  }

  // Sort tickets into slots
  const bySlot = {};
  for (const tc of ev.ticket_classes || []) {
    const s = slotOf(tc.name);
    if (!s) { notes.push(`"${tc.name}" isn't one of the 6 ticket types, so it was left alone.`); continue; }
    (bySlot[s] ||= []).push(tc);
  }

  const template = (bySlot.ga || [])[0] || (ev.ticket_classes || [])[0];
  const currency = template?.cost?.currency || "USD";

  for (const slot of Object.keys(QTY)) {
    const list = bySlot[slot] || [];
    if (list.length > 1) {
      notes.push(`More than one ticket looks like ${LABEL[slot]} (${list.map((x) => `"${x.name}"`).join(", ")}), so those were left alone. Check them by hand.`);
      continue;
    }
    const tc = list[0];
    const wantCents = Math.round(prices[slot] * 100);

    if (!tc) {
      if (slot === "dayof") {
        changes.push({
          type: "create", slot, text: `Create Day Of: ${money(prices.dayof)}, 10 tickets, on sale ${show(nightBefore, tz)} to ${show(eventDayEnd, tz)}`,
          body: {
            name: "Day Of", description: DAY_OF_DESC, quantity_total: QTY.dayof, cost: `${currency},${wantCents}`,
            sales_start: ebUtc(nightBefore), sales_end: ebUtc(eventDayEnd),
            ...(template?.minimum_quantity && { minimum_quantity: template.minimum_quantity }),
            ...(template?.maximum_quantity && { maximum_quantity: template.maximum_quantity }),
            ...(template?.include_fee !== undefined && { include_fee: template.include_fee }),
          },
        });
      } else {
        notes.push(`No ${LABEL[slot]} ticket on this event. I didn't create one.`);
      }
      continue;
    }

    const update = {};
    const said = [];
    const sold = Number(tc.quantity_sold) || 0;

    // Quantity (guard rule)
    let wantQty = QTY[slot];
    if (sold > wantQty) {
      guards.push({ ticket: tc.name, sold, planned: wantQty });
      wantQty = sold;
    }
    if (Number(tc.quantity_total) !== wantQty) {
      update.quantity_total = wantQty;
      said.push(`quantity ${tc.quantity_total} → ${wantQty}${wantQty === sold && sold > QTY[slot] ? ` (already sold ${sold})` : ""}`);
    }

    // Price
    if (!tc.free && !tc.donation && Number(tc.cost?.value) !== wantCents) {
      update.cost = `${tc.cost?.currency || currency},${wantCents}`;
      said.push(`price ${tc.cost ? money(tc.cost.value / 100) : "?"} → ${money(prices[slot])}`);
    }

    // Sale windows
    if (slot === "dayof") {
      if (!sameMinute(tc.sales_start, nightBefore)) {
        update.sales_start = ebUtc(nightBefore);
        said.push(`on sale ${show(nightBefore, tz)}`);
      }
      if (!sameMinute(tc.sales_end, eventDayEnd)) {
        update.sales_end = ebUtc(eventDayEnd);
        said.push(`ends ${show(eventDayEnd, tz)}`);
      }
      if ((tc.description || "").trim() !== DAY_OF_DESC) {
        update.description = DAY_OF_DESC;
        said.push("description updated");
      }
    } else if (slot !== "early") {
      if (!sameMinute(tc.sales_end, nightBefore)) {
        update.sales_end = ebUtc(nightBefore);
        said.push(`ends ${show(nightBefore, tz)}`);
      }
    }

    if (said.length) changes.push({ type: "update", slot, ticketId: tc.id, name: tc.name, body: update, text: `${tc.name}: ${said.join(", ")}` });
  }

  return { tz, changes, notes, guards };
};

// Read everything and work out the changes (no writes)
export const plan = async (token) => {
  const found = await findByDate(token, TARGETS);
  const out = [];
  for (const t of TARGETS) {
    const row = { date: t.date, label: t.label, verifyOnly: !!t.verifyOnly, id: t.id };
    try {
      if (!row.id) {
        const hits = found[t.date] || [];
        if (hits.length !== 1) {
          row.error = hits.length ? `Found ${hits.length} events on this date (${hits.map((h) => h.name).join(", ")}). Not sure which one.` : "Couldn't find this event on Eventbrite by date.";
          out.push(row);
          continue;
        }
        row.id = hits[0].id;
      }
      const ev = await eb(`/events/${row.id}/?expand=ticket_classes`, token);
      row.name = ev.name?.text;
      row.url = ev.url;
      row.status = ev.status;
      row.tickets = (ev.ticket_classes || []).map((tc) => ({
        name: tc.name, price: tc.cost ? tc.cost.value / 100 : 0, quantity: tc.quantity_total, sold: tc.quantity_sold || 0,
        salesEnd: tc.sales_end, hidden: !!tc.hidden,
      }));
      Object.assign(row, planEvent(t, ev));
    } catch (err) {
      row.error = err.message;
    }
    out.push(row);
  }
  return out;
};

// Make the changes, then read each event back to confirm
export const apply = async (token, syncFn) => {
  const rows = await plan(token);
  for (const row of rows) {
    if (row.error || row.skip || !row.changes?.length) {
      row.done = [];
      row.failed = [];
      if (!row.error && !row.skip) row.result = "Verified, no changes needed.";
      if (row.id && !row.error && !row.skip && syncFn) await syncFn(String(row.id)).catch(() => {});
      continue;
    }
    row.done = [];
    row.failed = [];
    for (const c of row.changes) {
      try {
        if (c.type === "capacity") {
          await eb(`/events/${row.id}/`, token, { method: "POST", body: JSON.stringify({ event: { capacity: c.to } }) });
        } else if (c.type === "create") {
          await eb(`/events/${row.id}/ticket_classes/`, token, { method: "POST", body: JSON.stringify({ ticket_class: c.body }) });
        } else {
          await eb(`/events/${row.id}/ticket_classes/${c.ticketId}/`, token, { method: "POST", body: JSON.stringify({ ticket_class: c.body }) });
        }
        row.done.push(c.text);
      } catch (err) {
        row.failed.push(`${c.text} — ${err.message}`);
      }
    }
    // Read back
    try {
      const ev = await eb(`/events/${row.id}/?expand=ticket_classes`, token);
      row.after = (ev.ticket_classes || []).map((tc) => ({
        name: tc.name, price: tc.cost ? tc.cost.value / 100 : 0, quantity: tc.quantity_total, sold: tc.quantity_sold || 0,
        salesStart: tc.sales_start, salesEnd: tc.sales_end,
      }));
    } catch { /* report what we have */ }
    // Push the new tickets onto the website now (instead of the tag trick)
    if (syncFn) {
      try { await syncFn(String(row.id)); row.siteSynced = true; } catch { row.siteSynced = false; }
    }
    row.result = row.failed.length ? "Some changes didn't go through." : "Updated.";
  }
  return rows;
};
