import {
  ArrowRight,
  Braces,
  CheckCircle2,
  DatabaseZap,
  Globe,
  Layers3,
  RadioTower,
} from "lucide-react";
import Link from "next/link";
import { DEPTH_CREDIT_COST, PLANS } from "@supacontext/core";
import { CopyCommand } from "../components/copy-command";
import { SiteHeader } from "../components/site-header";

const platforms = ["web", "Reddit", "X", "YouTube"];
const sourceLogos = [
  { name: "Web", logoClass: "webSourceLogo" },
  { name: "Reddit", logoClass: "redditSourceLogo" },
  { name: "X", logoClass: "xSourceLogo" },
  { name: "YouTube", logoClass: "youtubeSourceLogo" },
];
const sourceMarqueeItems = Array.from({ length: 3 }, (_, repeat) =>
  sourceLogos.map((source) => ({ ...source, key: `${repeat}-${source.name}` })),
).flat();
const productPoints = [
  "One endpoint for web, social, forum, and video context.",
  "Compact cited JSON shaped for agent prompts and tool calls.",
  "Depth controls that trade latency, cost, and coverage explicitly.",
];
const workflowSteps = [
  {
    title: "Agent asks for context",
    text: "Send a query, depth, and optional platform list from your server or agent runtime.",
  },
  {
    title: "SupaContext gathers signals",
    text: "The pipeline searches public sources, dedupes evidence, and scores what is worth keeping.",
  },
  {
    title: "Your app gets cited JSON",
    text: "Responses include answer text, context packs, source metadata, gaps, and usage accounting.",
  },
];
const homepagePlanSlugs = ["trial", "starter", "builder", "pro"] as const satisfies ReadonlyArray<
  keyof typeof PLANS
>;

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="scMarketing">
        <section className="scHero scHeroDotted">
          <div className="scHeroCopy">
            <h1>Public context agents can cite and trust.</h1>
            <p className="heroText">
              SupaContext turns web, Reddit, X, and YouTube into compact cited JSON your agents can
              trust. Choose the depth, control the spend, and keep every answer tied to sources.
            </p>
            <div className="heroActions">
              <Link className="button primaryButton" href="/dashboard">
                Start building
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <Link className="button secondaryButton" href="/docs">
                Read docs
              </Link>
            </div>
            <CopyCommand />
          </div>
          <div className="scSourceStrip" aria-label="Sources SupaContext scans">
            <span>Scans public context across</span>
            <div className="scSourceMarquee">
              <div className="scSourceTrack" aria-hidden="true">
                {[0, 1].map((group) => (
                  <div className="scSourceGroup" key={group}>
                    {sourceMarqueeItems.map((source) => (
                      <div className="scSourceItem" key={`${group}-${source.key}`}>
                        <span className={`scSourceLogo ${source.logoClass}`} aria-hidden="true">
                          {source.name === "Web" ? <Globe size={22} strokeWidth={2.3} /> : null}
                        </span>
                        <strong>{source.name}</strong>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="blueShowcase" aria-label="SupaContext context pipeline">
          <div className="signalBeam">
            <span />
            <span />
            <span />
          </div>
          <div className="showcaseMark" aria-hidden="true">
            SC
          </div>
        </section>

        <section className="section splitSection connectorSection">
          <div>
            <p className="eyebrow">Connectors</p>
            <h2>All the signals agents need, shaped into one response.</h2>
            <p className="mutedText">
              SupaContext is not a raw scraper or search dump. It is a context layer that normalizes
              public evidence into structured JSON your agent can cite and reason over.
            </p>
            <div className="featureList">
              {productPoints.map((point) => (
                <div key={point}>
                  <CheckCircle2 aria-hidden="true" size={18} />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="contextDiagram" aria-label="Source connector diagram">
            {platforms.map((platform) => (
              <div className="sourceNode" key={platform}>
                <RadioTower aria-hidden="true" size={18} />
                <span>{platform}</span>
              </div>
            ))}
            <div className="centerNode">
              <span className="brandMark largeMark" aria-hidden="true" />
              <strong>SupaContext</strong>
            </div>
          </div>
        </section>

        <section className="section productGrid">
          <div className="productPanel apiPanel">
            <div className="panelHeader">
              <span>Context API</span>
              <strong>standard - 20 credits</strong>
            </div>
            <pre>{`{
  "query": "latest React compiler guidance",
  "depth": "standard",
  "platforms": ["web", "reddit", "youtube"],
  "answer": "Compact cited context...",
  "sources": [
    { "id": "src_1", "platform": "web" },
    { "id": "src_2", "platform": "reddit" }
  ]
}`}</pre>
          </div>
          <div className="productPanel profilePanel">
            <div className="profileHeader">
              <div>
                <span>Agent profile</span>
                <strong>Research copilot</strong>
              </div>
              <div className="statusDot" aria-label="Active" />
            </div>
            <div className="profileRows">
              <div>
                <span>Sources</span>
                <strong>4 platforms</strong>
              </div>
              <div>
                <span>Citations</span>
                <strong>Required</strong>
              </div>
              <div>
                <span>Output</span>
                <strong>JSON only</strong>
              </div>
            </div>
            <Link className="button primaryButton fullButton" href="/playground">
              Open playground
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </section>

        <section className="section">
          <div className="sectionHeader centeredHeader">
            <p className="eyebrow">How it works</p>
            <h2>
              Bring a page of docs, forum arguments, and videos into your agent&apos;s working set.
            </h2>
          </div>
          <div className="featureGrid workflowGrid">
            {workflowSteps.map((step, index) => (
              <article className="card featureCard" key={step.title}>
                <span className="stepNumber">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section proofSection">
          <div className="proofCopy">
            <p className="eyebrow">Context over benchmarks</p>
            <h2>We do not think benchmarks tell the full story.</h2>
            <p className="mutedText">
              Agents fail when they miss current public context, source provenance, or the limits of
              what was found. SupaContext returns the story, the citations, and the gaps.
            </p>
          </div>
          <div className="proofVisual" aria-label="Context graph visualization">
            <div className="orbitalGraph">
              {Array.from({ length: 18 }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
            <div className="usageBars">
              <span />
              <span />
              <span />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="sectionHeader">
            <p className="eyebrow">Depth and billing</p>
            <h2>Best for latency, quality, and cost controls.</h2>
          </div>
          <div className="infoGrid">
            <article className="card">
              <Layers3 aria-hidden="true" size={22} />
              <h3>Depth levels</h3>
              <div className="rows">
                {Object.entries(DEPTH_CREDIT_COST).map(([depth, credits]) => (
                  <div className="row" key={depth}>
                    <span>{depth}</span>
                    <strong>{credits} credits</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="card">
              <DatabaseZap aria-hidden="true" size={22} />
              <h3>Credit plans</h3>
              <div className="rows">
                {homepagePlanSlugs.map((planSlug) => {
                  const plan = PLANS[planSlug];

                  return (
                    <div className="row" key={plan.slug}>
                      <span>{plan.name}</span>
                      <strong>{plan.includedCredits.toLocaleString()} credits</strong>
                    </div>
                  );
                })}
              </div>
            </article>
            <article className="card">
              <Braces aria-hidden="true" size={22} />
              <h3>JSON only</h3>
              <p className="mutedText">
                Public responses return structured context packs, citations, gaps, and usage
                metadata. No raw provider dumps reach the API consumer.
              </p>
            </article>
          </div>
        </section>

        <section className="ctaBand">
          <div>
            <p className="eyebrow">Start building</p>
            <h2>Your agent needs live public context.</h2>
          </div>
          <Link className="button lightButton" href="/dashboard">
            Get 50 trial credits
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </section>
      </main>
    </>
  );
}
