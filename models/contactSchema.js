import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import axios from 'axios';
import '../Styles/Contact.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const REASONS = [
  'General Inquiry',
  'Event Question',
  'Membership Question',
  'Sponsorship / Partnership',
  'Media or Press',
  'Plan an Event for Me',
];

const EVENT_TYPES = [
  'Corporate Event',
  'Birthday Celebration',
  'Private Dinner',
  'Team Building',
  'Social Mixer',
  'Other',
];

const BUDGET_RANGES = [
  'Under $1,000',
  '$1,000 – $2,500',
  '$2,500 – $5,000',
  '$5,000 – $10,000',
  '$10,000+',
  'Not sure yet',
];

const SOCIALS = [
  {
    label: 'Instagram',
    url: 'https://instagram.com/grownfolkscollective',
    icon: (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'TikTok',
    url: 'https://tiktok.com/@grownfolkscollective',
    icon: (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
      </svg>
    ),
  },
  {
    label: 'Facebook',
    url: 'https://facebook.com/grownfolkscollectiveatl',
    icon: (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    label: 'Threads',
    url: 'https://threads.net/@grownfolkscollective',
    icon: (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.473 12.01v-.017c.027-3.579.877-6.43 2.528-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.594 12c.022 3.086.713 5.496 2.051 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.583-1.3-.881-2.347-.887H12c-.912 0-1.708.283-2.27.801-.386.354-.623.818-.696 1.38l-2.02-.283c.148-1.048.6-1.97 1.328-2.683C9.394 7.57 10.62 7.002 12 7.002h.026c1.527.007 2.793.454 3.765 1.33 1.046.941 1.62 2.31 1.708 4.073.017.344.02.693.007 1.042.462.37.875.794 1.22 1.266 1.02 1.384 1.263 3.318.668 5.01C18.687 21.979 16.35 24 12.186 24zm.28-9.217c-.148 0-.295.005-.44.013-1.017.057-1.818.332-2.315.797-.43.4-.647.919-.618 1.464.056 1.023.97 1.682 2.332 1.607 1.133-.062 1.975-.468 2.502-1.206.41-.571.633-1.38.665-2.397a11.68 11.68 0 0 0-2.126-.278z" />
      </svg>
    ),
  },
  {
    label: 'LinkedIn',
    url: 'https://linkedin.com/company/grownfolkscollective',
    icon: (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
];

const Contact = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    reason: '',
    message: '',
    eventDetails: {
      eventType: '',
      guestCount: '',
      preferredDate: '',
      budget: '',
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback]         = useState(null);

  const feedbackRef = useRef(null);
  useEffect(() => {
    if (feedback && feedbackRef.current) {
      feedbackRef.current.focus();
    }
  }, [feedback]);

  const formatPhoneNumber = (value) => {
    if (!value) return value;
    const phoneNumber = value.replace(/[^\d]/g, '');
    const len = phoneNumber.length;
    if (len < 4) return phoneNumber;
    if (len < 7) return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setFormData(prev => ({ ...prev, phone: formatPhoneNumber(value) }));
    } else if (name.startsWith('event_')) {
      const key = name.replace('event_', '');
      setFormData(prev => ({
        ...prev,
        eventDetails: { ...prev.eventDetails, [key]: value },
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    if (feedback) setFeedback(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await axios.post(`${API}/api/contact`, formData);
      setFeedback({
        type: 'success',
        message: "Message received. We'll be in touch within 48 hours.",
      });
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        reason: '',
        message: '',
        eventDetails: { eventType: '', guestCount: '', preferredDate: '', budget: '' },
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || 'Something went wrong. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const showEventSection = formData.reason === 'Plan an Event for Me';

  return (
    <div className="contact-page">

      <a href="#main-content" className="skip-link">Skip to main content</a>

      <Helmet>
        <title>Contact Us | Grown Folks Collective</title>
        <meta
          name="description"
          content="Get in touch with Grown Folks Collective. Ask about events, membership, sponsorships, or let us plan an event for you."
        />
      </Helmet>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <header className="contact-hero" role="banner">
        <div className="contact-hero-inner">

          {/* LEFT col */}
          <div className="contact-hero-left">
            <span className="contact-eyebrow" aria-hidden="true">Get In Touch</span>
            <h1 className="contact-hero-title">Contact Us</h1>
            <div className="contact-gold-spacer" aria-hidden="true"></div>
            <p className="contact-hero-lead">
              Whether you have a question, want to learn more about membership,
              or want us to plan an event for you — we're here. Reach out and
              we'll respond within 48 hours.
            </p>
            <nav className="contact-hero-links" aria-label="Quick contact actions">
              <Link to="/events" className="contact-hero-link">
                View Upcoming Events
              </Link>
              <Link to="/membership" className="contact-hero-link secondary">
                Join the Collective
              </Link>
            </nav>
          </div>

          {/* RIGHT col — contact info */}
          <address className="contact-hero-right">

            {/* Social Icons */}
            <div className="contact-info-block contact-socials-block">
              <p className="contact-info-label" id="social-label">Follow Us</p>
              <ul
                className="contact-socials"
                role="list"
                aria-labelledby="social-label"
              >
                {SOCIALS.map(({ label, url, icon }) => (
                  <li key={label}>
                    <a
                      href={url}
                      className="contact-social-icon"
                      aria-label={`Follow Grown Folks Collective on ${label} (opens in new tab)`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {icon}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Email */}
            <div className="contact-info-block">
              <p className="contact-info-label">Email</p>
              <a
                href="mailto:hello@grownfolkscollective.com"
                className="contact-info-value"
              >
                hello@grownfolkscollective.com
              </a>
            </div>

            {/* Location */}
            <div className="contact-info-block">
              <p className="contact-info-label">Location</p>
              <p className="contact-info-value contact-info-static">Atlanta, GA</p>
            </div>

            {/* Response Time */}
            <div className="contact-info-block">
              <p className="contact-info-label">Response Time</p>
              <p className="contact-info-value contact-info-static">Within 48 Hours</p>
            </div>

          </address>
        </div>
      </header>

      {/* ── MAIN ─────────────────────────────────────────────────────────── */}
      <main id="main-content">
        <section
          className="contact-form-section"
          aria-labelledby="contact-form-heading"
        >
          <div className="contact-form-container">

            <header className="contact-form-header">
              <span className="contact-form-eyebrow" aria-hidden="true">Send a Message</span>
              <h2 className="contact-form-title" id="contact-form-heading">
                Let's Talk
              </h2>
              <p className="contact-form-subhead">
                Fill out the form below and we'll get back to you within 48 hours.
                For faster response, email us directly at{' '}
                <a
                  href="mailto:hello@grownfolkscollective.com"
                  className="contact-inline-link"
                >
                  hello@grownfolkscollective.com
                </a>
              </p>
            </header>

            <form
              onSubmit={handleSubmit}
              className="contact-luxe-form"
              aria-label="Contact form"
              noValidate
            >

              {/* ── FIELDSET: Your Information ─────────────────────────── */}
              <fieldset className="contact-fieldset">
                <legend className="contact-form-divider">Your Information</legend>

                <div className="contact-form-row">
                  <div className="contact-input-group">
                    <label className="contact-label" htmlFor="firstName">
                      First Name{' '}
                      <span className="contact-required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="firstName"
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      required
                      aria-required="true"
                      autoComplete="given-name"
                    />
                  </div>

                  <div className="contact-input-group">
                    <label className="contact-label" htmlFor="lastName">
                      Last Name{' '}
                      <span className="contact-required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      required
                      aria-required="true"
                      autoComplete="family-name"
                    />
                  </div>
                </div>

                <div className="contact-form-row">
                  <div className="contact-input-group">
                    <label className="contact-label" htmlFor="email">
                      Email{' '}
                      <span className="contact-required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="email"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      aria-required="true"
                      autoComplete="email"
                    />
                  </div>

                  <div className="contact-input-group">
                    <label className="contact-label" htmlFor="phone">
                      Phone{' '}
                      <span className="contact-label-optional">(Optional)</span>
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      maxLength="14"
                      autoComplete="tel"
                      inputMode="numeric"
                      aria-describedby="phone-hint"
                    />
                    <span id="phone-hint" className="contact-input-hint">
                      Format: (555) 555-5555
                    </span>
                  </div>
                </div>
              </fieldset>

              {/* ── FIELDSET: Your Message ──────────────────────────────── */}
              <fieldset className="contact-fieldset">
                <legend className="contact-form-divider">Your Message</legend>

                <div className="contact-input-group">
                  <label className="contact-label" htmlFor="reason">
                    I'm reaching out about...{' '}
                    <span className="contact-required" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="reason"
                    name="reason"
                    value={formData.reason}
                    onChange={handleChange}
                    required
                    aria-required="true"
                  >
                    <option value="">Select a reason...</option>
                    {REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Conditional: event planning fields */}
                <div aria-live="polite" aria-atomic="false">
                  {showEventSection && (
                    <fieldset className="contact-event-planning-section contact-fieldset contact-fieldset--nested">
                      <legend className="contact-event-planning-label">
                        Tell Us About Your Event
                      </legend>

                      <div className="contact-form-row">
                        <div className="contact-input-group">
                          <label className="contact-label" htmlFor="event_eventType">
                            Event Type
                          </label>
                          <select
                            id="event_eventType"
                            name="event_eventType"
                            value={formData.eventDetails.eventType}
                            onChange={handleChange}
                          >
                            <option value="">Select event type...</option>
                            {EVENT_TYPES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>

                        <div className="contact-input-group">
                          <label className="contact-label" htmlFor="event_guestCount">
                            Estimated Guest Count
                          </label>
                          <input
                            id="event_guestCount"
                            type="number"
                            name="event_guestCount"
                            value={formData.eventDetails.guestCount}
                            onChange={handleChange}
                            min="1"
                            inputMode="numeric"
                          />
                        </div>
                      </div>

                      <div className="contact-form-row">
                        <div className="contact-input-group">
                          <label className="contact-label" htmlFor="event_preferredDate">
                            Preferred Date
                          </label>
                          <input
                            id="event_preferredDate"
                            type="date"
                            name="event_preferredDate"
                            value={formData.eventDetails.preferredDate}
                            onChange={handleChange}
                            aria-describedby="date-hint"
                            min={new Date().toISOString().split('T')[0]}
                          />
                          <span id="date-hint" className="contact-input-hint">
                            Select a future date
                          </span>
                        </div>

                        <div className="contact-input-group">
                          <label className="contact-label" htmlFor="event_budget">
                            Budget Range
                          </label>
                          <select
                            id="event_budget"
                            name="event_budget"
                            value={formData.eventDetails.budget}
                            onChange={handleChange}
                          >
                            <option value="">Select budget range...</option>
                            {BUDGET_RANGES.map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </fieldset>
                  )}
                </div>

                <div className="contact-input-group">
                  <label className="contact-label" htmlFor="message">
                    Message{' '}
                    <span className="contact-required" aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    className="contact-textarea"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    aria-required="true"
                    rows="6"
                  />
                </div>
              </fieldset>

              {/* Required field note */}
              <p className="contact-required-note">
                <span aria-hidden="true">*</span> Required fields
              </p>

              {/* Feedback region */}
              <div aria-live="polite" aria-atomic="true">
                {feedback && (
                  <div
                    ref={feedbackRef}
                    className={`contact-feedback ${feedback.type}`}
                    role={feedback.type === 'error' ? 'alert' : 'status'}
                    tabIndex={-1}
                  >
                    <span className="sr-only">
                      {feedback.type === 'error' ? 'Error: ' : 'Success: '}
                    </span>
                    {feedback.message}
                  </div>
                )}
              </div>

              {/* Submit button */}
              <button
                type="submit"
                className="contact-submit-btn"
                disabled={isSubmitting}
                aria-disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting
                  ? <span aria-live="polite" aria-atomic="true">Sending…</span>
                  : 'Send Message'
                }
              </button>

            </form>
          </div>
        </section>
      </main>

    </div>
  );
};

export default Contact;