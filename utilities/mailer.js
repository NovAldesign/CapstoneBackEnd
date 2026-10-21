import { Resend } from "resend";

// -------------------------------------------------------
// One shared email sender for the whole backend.
// Drop-in for `new Resend(...)`: use mailer.emails.send(...) and mailer.batch.send(...).
//
// Why: Resend does NOT throw when a send fails. It returns { data, error }, so a
// `.catch()` never fires and failed emails disappeared without a trace. It also allows
// only a few requests per second, so two emails sent at the same moment (ticket email +
// sale alert) could get one rejected.
//
// This wrapper:
//   1. Sends one email at a time, spaced out, so we stay under the rate limit.
//   2. Retries rate-limit, server and network errors (3 tries).
//   3. Logs every final failure with who it was for, so nothing fails silently.
// It still returns Resend's { data, error }, so existing code keeps working.
// -------------------------------------------------------

const client = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const GAP_MS = 600; // about 1.6 sends per second, under Resend's limit
const TRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let queue = Promise.resolve();
let lastSend = 0;
const inLine = (fn) => {
  const run = queue.then(async () => {
    const wait = lastSend + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastSend = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
};

const canRetry = (error = {}) => {
  const code = Number(error.statusCode) || 0;
  return code === 0 || code === 429 || code >= 500 || /rate|too many|timeout|network|fetch|ECONN|socket/i.test(`${error.name} ${error.message}`);
};

const recipients = (payload) => {
  const list = Array.isArray(payload) ? payload.flatMap((p) => [].concat(p?.to || [])) : [].concat(payload?.to || []);
  return list.length > 3 ? `${list.slice(0, 3).join(", ")} +${list.length - 3} more` : list.join(", ");
};

const deliver = async (kind, send, payload, options) => {
  let result = { data: null, error: { message: "Not sent", statusCode: 0 } };
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    try {
      result = (await inLine(() => send(payload, options))) || { data: null, error: { message: "Empty response", statusCode: 0 } };
    } catch (err) {
      result = { data: null, error: { name: err?.name, message: err?.message || "Send failed", statusCode: 0 } };
    }
    if (!result.error) return result;
    // A batch is only retried when it was clearly refused (rate limit), never on a
    // timeout where it may have gone out, so a 100-person send is never doubled.
    const retry = kind === "batch" ? Number(result.error.statusCode) === 429 : canRetry(result.error);
    if (attempt < TRIES && retry) {
      await sleep(1000 * attempt);
      continue;
    }
    break;
  }
  const subject = Array.isArray(payload) ? `${payload.length} emails` : payload?.subject || "";
  console.error(`EMAIL FAILED (${kind}) to ${recipients(payload)} | "${subject}" | ${result.error.statusCode || ""} ${result.error.message}`);
  return result;
};

export const mailer = client
  ? {
      emails: {
        // Returns { data, error } like Resend (never throws). Failures are logged.
        send: (payload, options) => deliver("email", (p, o) => client.emails.send(p, o), payload, options),
        // Throws if the email didn't go out, so try/catch and "email sent" flags are accurate.
        sendOrThrow: async (payload, options) => {
          const { data, error } = await deliver("email", (p, o) => client.emails.send(p, o), payload, options);
          if (error) throw new Error(error.message || "Email service rejected the message.");
          return { data, error: null };
        },
      },
      batch: { send: (payload, options) => deliver("batch", (p, o) => client.batch.send(p, o), payload, options) },
    }
  : null;

// Send and throw if it failed (for code that wants try/catch)
export const sendOrThrow = async (payload) => {
  if (!mailer) throw new Error("Email isn't set up (RESEND_API_KEY missing).");
  const { data, error } = await mailer.emails.send(payload);
  if (error) throw new Error(error.message || "Email service rejected the message.");
  return data;
};

export default mailer;
