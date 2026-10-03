// GFC Select™ email copy, written separately for men and women.
// Each function returns { subject, message, button, footer }.
// `message` is plain text: a blank line starts a new paragraph.
// gender: "man" | "woman" | "" (unknown → a neutral version)

const SITE = process.env.SITE_URL || "https://www.grownfolkscollective.com";
const page = (gender, src) =>
  `${SITE}/select/${gender === "man" ? "gentlemen" : gender === "woman" ? "ladies" : ""}${src ? `?src=${src}` : ""}`.replace("/select/?", "/select?");

// "The doors open Friday, November 20, for two weeks only." etc.
export const doorsLine = (state, opens) =>
  state === "open"
    ? "The doors are open right now, for a short time only."
    : opens
      ? `The doors open ${opens}, for two weeks only.`
      : "The doors open soon, for two weeks only.";

/* ---------- 1. "You're on the list" (notify sign-up) ---------- */
export const notifyConfirm = ({ firstName, gender, doors }) => {
  const footer = "You're receiving this because you joined the GFC Select™ list. Please keep the details private.";
  if (gender === "man") {
    return {
      subject: `You're on the list, ${firstName}.`,
      message: `${firstName}, you're on the list.

${doors} We'll tell you the moment they do.

Here's the deal: twenty seats for men, twenty for women, every guest selected. Every woman in the room is 30+, vetted, and there to meet a good man. Your picks stay private, and nothing is ever posted.

Be ready when the doors open. The seats go to the men who show up for them.`,
      button: { href: page("man"), label: "How the night runs" },
      footer,
    };
  }
  if (gender === "woman") {
    return {
      subject: `You're on the list, ${firstName}.`,
      message: `${firstName}, you're on the list.

${doors} You'll be among the first to know.

Every man in that room will be chosen. Each one applied, answered the same questions you will, and was selected with care. A host is with you all evening, and your information is never shared unless you both choose each other.

We can't wait to welcome you.`,
      button: { href: page("woman"), label: "See your evening" },
      footer,
    };
  }
  return {
    subject: "You're on the list for GFC Select™",
    message: `${firstName}, you're on the list.

${doors} You'll be among the first to know.

Forty seats. Twenty men, twenty women. One unforgettable night.`,
    button: null,
    footer,
  };
};

/* ---------- 2. "Request received" (application) ---------- */
export const applyConfirm = ({ firstName, gender }) => {
  const footer = "You're receiving this because you requested an invitation to GFC Select™. Please keep the details private.";
  if (gender === "man") {
    return {
      subject: "Your GFC Select™ request is in",
      message: `${firstName}, your request is in.

Every man in the room is selected by hand, so we review each request carefully. If you're chosen, your invitation will have the date, that evening's dress code and how to reserve your seat. The location is shared with selected guests 48 hours before.

Until then, keep it between us.`,
      button: null,
      footer,
    };
  }
  return {
    subject: "Your GFC Select™ request has been received",
    message: `${firstName}, thank you. Your request has been received.

We're building a room that's worthy of you. Every guest is personally selected, and every man has been vetted. If you're selected, your invitation arrives with every detail: the date, the dress code and how to reserve your seat. The location is shared 48 hours before.

Until then, keep it between us.`,
    button: null,
    footer,
  };
};

/* ---------- 3. Nomination invite (someone vouched for them) ---------- */
export const nominationInvite = ({ firstName, gender, nominatorName, shareName, doors }) => {
  const footer = "You're receiving this one-time note because someone nominated you for GFC Select™. We won't email you again unless you join the list.";
  if (gender === "woman") {
    const who = shareName ? `${nominatorName}, who thinks the world of you,` : "Someone who thinks the world of you";
    return {
      subject: `${firstName}, you've been nominated for GFC Select™`,
      message: `${firstName},

${who} nominated you for GFC Select™.

GFC Select™ is a private masquerade evening for Atlanta singles 30 and over. Twenty women and twenty men, every guest selected. Every man in the room is vetted. A host is with you all night, the location stays private, and your information is never shared unless you both choose each other.

You deserve a room like that, and someone who knows you agrees.

${doors} Get on the list and you'll be the first to know. Nothing to pay and no commitment.`,
      button: { href: page("woman", "nominated"), label: "Get on the list" },
      footer,
    };
  }
  const who = shareName ? `${nominatorName}, who thinks highly of you,` : "Someone who thinks highly of you";
  return {
    subject: `${firstName}, you've been nominated for GFC Select™`,
    message: `${firstName},

${who} nominated you for GFC Select™.

GFC Select™ is a private masquerade evening for Atlanta singles 30 and over. Twenty women and twenty men, every guest selected. No apps, no speed dating, no cameras. Good food, games, and a room full of grown folks who are ready to meet someone.

We hold twenty seats for men, and we only fill them with the right ones. Being nominated means someone believes you're one of them.

${doors} Get on the list and you'll be the first to know. Nothing to pay and no commitment.`,
    button: { href: page("man", "nominated"), label: "Get on the list" },
    footer,
  };
};

/* ---------- 4. Thank-you to the person who nominated ---------- */
export const nominatorThanks = ({ nominatorName, nomineeFirstName, gender, status }) => {
  const he = gender === "woman" ? "she" : "he";
  const him = gender === "woman" ? "her" : "him";
  const outcome = {
    invited: `We just sent ${nomineeFirstName} a personal invitation.`,
    text: `We'll reach out to ${nomineeFirstName} personally by text.`,
    already: `Good news: ${nomineeFirstName} is already on our list.`,
    repeat: `Someone else nominated ${nomineeFirstName} recently too, so ${he}'s already heard from us. Clearly ${he}'s a good one.`,
  }[status];
  return {
    subject: `Thank you for nominating ${nomineeFirstName}`,
    message: `${nominatorName}, thank you.

${outcome} We never share more than you said we could, and we only reach out to ${him} once.

Good rooms are built by people who know good people. If you know someone else, 30 or older and single, who belongs in the room, nominate them too.`,
    button: { href: `${SITE}/select/nominate`, label: "Nominate someone else" },
    footer: "You're receiving this because you nominated someone for GFC Select™.",
  };
};

/* ---------- 5. Friend invite ("applying with a friend") ---------- */
// inviterGender decides "with him" / "with her"; friend's gender decides the pitch
export const friendInvite = ({ friendName, gender, inviterName, inviterGender, doors }) => {
  const withThem = inviterGender === "man" ? "with him" : inviterGender === "woman" ? "with her" : "there too";
  const footer = "You're receiving this one-time note because a friend asked us to invite you to GFC Select™. We won't email you again unless you join the list.";
  if (gender === "woman") {
    return {
      subject: `${inviterName} wants you there`,
      message: `${friendName},

${inviterName} just got on the list for GFC Select™ and wants you there ${withThem}.

It's a private masquerade evening in Atlanta for singles 30 and over. Twenty women, twenty men, every guest selected. Every man in the room is vetted. A host is with you all evening, and your information is never shared unless you both choose each other.

Each guest is selected on her own, but friends who both apply are seated at the same evening whenever we can.

${doors} Get on the list and you'll be the first to know.`,
      button: { href: page("woman", "friend"), label: "Get on the list" },
      footer,
    };
  }
  return {
    subject: `${inviterName} wants you in the room`,
    message: `${friendName},

${inviterName} just got on the list for GFC Select™ and wants you in the room ${withThem}.

It's a private masquerade night in Atlanta. Twenty men, twenty women, all 30+, every guest selected. Every woman there is vetted and there to meet a good man. Your picks stay private. No apps, no speed dating, no cameras.

Each man is selected on his own, but friends who both apply are seated at the same evening whenever we can. Not everyone gets in.

${doors} Get on the list and you'll be the first to know.`,
    button: { href: page("man", "friend"), label: "Get on the list" },
    footer,
  };
};
