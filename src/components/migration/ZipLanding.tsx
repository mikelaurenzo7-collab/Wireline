import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronRight,
  MessageSquareText,
  PhoneCall,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

import MarketingFooter from "../marketing/MarketingFooter";
import PrecisionPublicHeader from "../marketing/PrecisionPublicHeader";

const outcomes = [
  {
    icon: PhoneCall,
    label: "Answers",
    title: "Calls handled without the hold music.",
    body: "Screen, resolve, route, and follow up while you stay focused on the work that needs you.",
  },
  {
    icon: CalendarCheck,
    label: "Books",
    title: "Appointments that land on the calendar.",
    body: "Your agent checks availability, confirms the details, and sends the next step where it belongs.",
  },
  {
    icon: MessageSquareText,
    label: "Follows through",
    title: "A clear record after every conversation.",
    body: "Get summaries, handoffs, and text or email follow-up without chasing the thread.",
  },
] as const;

const workflow = [
  ["01", "Give it the job", "Describe the calls, messages, or work you want off your plate."],
  ["02", "Shape the playbook", "Add your voice, knowledge, approvals, and connected tools."],
  ["03", "Stay in the loop", "Review outcomes, coach the agent, and make changes in one place."],
] as const;

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="zip-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function OperatingPanel() {
  return (
    <div className="zip-operations-panel" aria-label="Wireline operating view preview">
      <div className="zip-operations-topbar">
        <div className="zip-operations-brand">
          <span>W</span> Wireline
        </div>
        <div className="zip-operations-status">
          <i /> Live command layer
        </div>
      </div>
      <div className="zip-operations-grid">
        <div className="zip-operations-main">
          <div className="zip-metric-grid">
            <Metric value="142" label="calls today" />
            <Metric value="96%" label="quality" />
            <Metric value="24/7" label="coverage" />
          </div>
          <article className="zip-active-call">
            <div className="zip-eyebrow">Active call</div>
            <div className="zip-active-call-title">
              Front Desk
              <br />
              Sarah <span>Live</span>
            </div>
            <p>Caller intent: schedule service estimate</p>
            <p>Confidence: 94% · Human review not required</p>
            <p>Next action: book Friday 11:30 AM and send SMS confirmation</p>
          </article>
        </div>
        <aside className="zip-operations-lanes">
          <p className="zip-eyebrow">Operating lanes</p>
          <Lane
            title="Personal"
            items={["Unknown caller screened", "Pharmacy hold handled", "Summary sent to iPhone"]}
          />
          <Lane
            title="Business"
            items={["Sarah booked Friday 11:30", "Lead pushed to CRM", "Refund needs approval"]}
          />
          <Lane
            title="Training"
            items={["Objection added", "Policy updated", "Simulator passed 92%"]}
          />
        </aside>
      </div>
    </div>
  );
}

function Lane({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <section className="zip-lane">
      <h3>{title}</h3>
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </section>
  );
}

export default function ZipLanding() {
  return (
    <div className="zip-public zip-landing min-h-screen">
      <PrecisionPublicHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="zip-hero">
          <div className="zip-shell zip-hero-grid">
            <div className="zip-hero-copy">
              <p className="zip-pill">
                <Sparkles size={13} aria-hidden="true" /> Personal and team agent coverage
              </p>
              <h1>
                Your phone, finally <em>working</em> for you.
              </h1>
              <p className="zip-hero-body">
                Wireline answers, routes, logs, and follows up on calls for individuals and
                businesses—from one personal assistant to a full fleet of trained AI agents.
              </p>
              <div className="zip-stat-cards" aria-label="Wireline operating modes">
                <Metric value="1" label="personal agent" />
                <Metric value="24/7" label="front desk coverage" />
                <Metric value="Fleet" label="trained business agents" />
              </div>
              <div className="zip-actions">
                <Link className="zip-button zip-button-primary" to="/signup">
                  Get started <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link className="zip-button zip-button-secondary" to="/showcase">
                  <PhoneCall size={16} aria-hidden="true" /> Preview agents
                </Link>
              </div>
            </div>
            <OperatingPanel />
          </div>
        </section>

        <section className="zip-section zip-outcomes">
          <div className="zip-shell">
            <p className="zip-eyebrow">What Wireline does</p>
            <div className="zip-section-heading">
              <h2>One operating layer for the conversations that move your day.</h2>
              <p>
                Start personal. Add a business front desk when the work calls for it. The same
                control room keeps every conversation clear.
              </p>
            </div>
            <div className="zip-outcome-grid">
              {outcomes.map(({ icon: Icon, label, title, body }) => (
                <article className="zip-outcome-card" key={label}>
                  <span className="zip-card-icon">
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <p className="zip-eyebrow">{label}</p>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="zip-section zip-workflow-section">
          <div className="zip-shell zip-workflow-grid">
            <div>
              <p className="zip-eyebrow">How it works</p>
              <h2>Set the job. Keep the outcome.</h2>
              <p className="zip-section-copy">
                Wireline gives you a real operating system for assistants—not another inbox to
                babysit.
              </p>
              <Link className="zip-inline-link" to="/features">
                Explore the system <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <ol className="zip-workflow-list">
              {workflow.map(([number, title, body]) => (
                <li key={number}>
                  <span>{number}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="zip-section zip-trust-section">
          <div className="zip-shell zip-trust-card">
            <div>
              <p className="zip-eyebrow">Built for control</p>
              <h2>Useful autonomy. Clear approvals.</h2>
              <p>
                You decide the voice, the tools, the handoff, and the actions that need a human
                check.
              </p>
            </div>
            <ul>
              {[
                "Your knowledge and playbook",
                "Approved calendar and CRM access",
                "Summaries and handoffs by default",
                "Human review where it matters",
              ].map((item) => (
                <li key={item}>
                  <Check size={16} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <ShieldCheck className="zip-trust-icon" aria-hidden="true" />
          </div>
        </section>

        <section className="zip-final-cta">
          <div className="zip-shell">
            <p className="zip-eyebrow">Start with one useful job</p>
            <h2>Give your phone a better shift.</h2>
            <p>
              Build one agent free. Move into team coverage when you need routing, approvals, and
              shared operations.
            </p>
            <div className="zip-actions">
              <Link className="zip-button zip-button-primary" to="/signup">
                Get started <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link className="zip-button zip-button-secondary" to="/pricing">
                See pricing
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
