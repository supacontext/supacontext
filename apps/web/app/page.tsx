import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ComparisonSection } from "../components/comparison-section";
import { CopyCommand } from "../components/copy-command";
import { HowItWorksSection } from "../components/how-it-works-section";
import { SiteHeader } from "../components/site-header";

const sourceLogos = [
  { name: "Web", logoClass: "webSourceLogo" },
  { name: "Reddit", logoClass: "redditSourceLogo" },
  { name: "X / Twitter", logoClass: "xSourceLogo" },
  { name: "YouTube", logoClass: "youtubeSourceLogo" },
];
const sourceMarqueeItems = Array.from({ length: 3 }, (_, repeat) =>
  sourceLogos.map((source) => ({ ...source, key: `${repeat}-${source.name}` })),
).flat();
const accessibleSourceNames = Array.from(new Set(sourceMarqueeItems.map((source) => source.name)));
const heroBenefits = [
  {
    title: "Unified Access",
    text: "Web, Reddit, X, and YouTube through one endpoint. No connector sprawl.",
  },
  {
    title: "Less Token Waste",
    text: "Send compact context instead of raw pages, threads, and transcripts.",
  },
  {
    title: "Better Agent Answers",
    text: "Fresh, cited evidence from multiple sources means less guessing.",
  },
  {
    title: "No Tool Overload",
    text: "Give agents one context tool to choose, not a crowded toolbox.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="scMarketing">
        <section className="scHero scHeroDotted">
          <div className="scHeroCopy">
            <h1>
              The context API for<span className="heroHeadingPhrase">
                <span className="heroHeadingDecoration" aria-hidden="true" />
                agents
              </span>
              <span className="heroHeadingAccent">.</span>
            </h1>
            <p className="heroText">
              Supacontext replaces separate Web, Reddit, X, and YouTube integrations with one
              endpoint that returns compact, cited JSON for AI agents.
            </p>
            <div className="heroActions">
              <Link className="button primaryButton" href="/dashboard">
                Start Free
                <span className="buttonDivider" aria-hidden="true" />
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <Link className="button secondaryButton" href="/docs">
                Read docs
              </Link>
            </div>
            <CopyCommand />
          </div>
          <div className="scSourceStrip" aria-label="Sources Supacontext scans">
            <span>One endpoint across</span>
            <ul className="scSourceAccessibleList">
              {accessibleSourceNames.map((sourceName) => (
                <li key={sourceName}>{sourceName}</li>
              ))}
            </ul>
            <div className="scSourceMarquee">
              <div className="scSourceTrack" aria-hidden="true">
                {[0, 1].map((group) => (
                  <div className="scSourceGroup" key={group}>
                    {sourceMarqueeItems.map((source) => (
                      <div className="scSourceItem" key={`${group}-${source.key}`}>
                        <span className={`scSourceLogo ${source.logoClass}`} aria-hidden="true" />
                        <strong>{source.name}</strong>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="scBenefitStrip" aria-label="Supacontext benefits">
          {heroBenefits.map((benefit, index) => (
            <article className="scBenefitCard" key={benefit.title}>
              <span className="scBenefitNumber">/{String(index + 1).padStart(2, "0")}</span>
              <h2>{benefit.title}</h2>
              <p>{benefit.text}</p>
            </article>
          ))}
        </section>

        <ComparisonSection />
        <HowItWorksSection />
      </main>
    </>
  );
}
