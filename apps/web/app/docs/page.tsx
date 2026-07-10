import { ArrowRight, BookOpen, Braces, KeyRound, RadioTower, Webhook } from "lucide-react";
import Link from "next/link";
import { CONTEXT_EFFORTS, EFFORT_PROFILES, PLATFORMS } from "@supacontext/core";
import { SiteHeader } from "../../components/site-header";
import { formatEffort } from "../../lib/usage-formatting";

const docs = [
  {
    href: "/docs/quickstart",
    title: "Quickstart",
    text: "Create a key, make your first request, and inspect the JSON response.",
    icon: BookOpen,
  },
  {
    href: "/docs/api-reference",
    title: "API reference",
    text: "Request schema, authentication, async jobs, webhooks, and errors.",
    icon: Braces,
  },
];

export default function DocsPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="pageHero">
          <p className="eyebrow">Docs</p>
          <h1>Integrate live public context with one endpoint.</h1>
          <p className="heroText">
            Supacontext accepts a query, optional effort and credit cap, and optional platform list.
            It returns compact structured JSON with citations, gaps, and usage metadata.
          </p>
        </section>

        <section className="featureGrid">
          {docs.map((doc) => {
            const Icon = doc.icon;

            return (
              <Link className="card linkCard" href={doc.href} key={doc.href}>
                <Icon aria-hidden="true" size={22} />
                <h2>{doc.title}</h2>
                <p>{doc.text}</p>
                <span>
                  Open
                  <ArrowRight aria-hidden="true" size={15} />
                </span>
              </Link>
            );
          })}
        </section>

        <section className="section infoGrid">
          <article className="card">
            <KeyRound aria-hidden="true" size={22} />
            <h3>Authentication</h3>
            <p className="mutedText">
              Send API keys as bearer tokens. Raw keys are shown once on creation and stored only as
              hashes.
            </p>
          </article>
          <article className="card">
            <RadioTower aria-hidden="true" size={22} />
            <h3>Platform selection</h3>
            <p className="mutedText">
              Choose from {PLATFORMS.join(", ")}, or omit platforms to let the research agent pick
              relevant sources.
            </p>
          </article>
          <article className="card">
            <Webhook aria-hidden="true" size={22} />
            <h3>Async jobs</h3>
            <p className="mutedText">
              Long-running jobs can queue and complete through polling or webhooks without changing
              the public response schema.
            </p>
          </article>
        </section>

        <section className="section">
          <article className="card">
            <h2>Effort and request caps</h2>
            <p className="mutedText">
              Charges reflect actual provider operations and model tokens. Each effort has an
              internal maximum; <code>max_credits</code> can set a lower request cap.
            </p>
            <div className="rows">
              {CONTEXT_EFFORTS.map((effort) => (
                <div className="row" key={effort}>
                  <span>{formatEffort(effort)}</span>
                  <strong>{EFFORT_PROFILES[effort].maximumCredits.toString()} credit cap</strong>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
