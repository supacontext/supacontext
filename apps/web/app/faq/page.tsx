import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "../../components/site-header";
import { faqs } from "../../lib/faq-content";

export const metadata: Metadata = {
  title: "FAQ | Supacontext",
  description:
    "Answers about Supacontext, the context API for AI agents that returns compact, cited JSON from 11 public platforms.",
};

export default function FAQPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="pageHero faqPageHero">
          <p className="eyebrow">FAQ</p>
          <h1>Supacontext FAQ.</h1>
          <p className="heroText">
            Answers about context APIs, agentic research, RAG, citations, credits, and server-side
            integration.
          </p>
        </section>

        <section className="faqPageList" aria-label="Supacontext frequently asked questions">
          {faqs.map((faq) => (
            <article className="faqPageItem" key={faq.question}>
              <h2>{faq.question}</h2>
              <p>{faq.answer}</p>
            </article>
          ))}
        </section>

        <section className="faqPageCta" aria-label="Start using Supacontext">
          <h2>Ready to give your agent fresh context?</h2>
          <Link className="button primaryButton" href="/dashboard">
            Start Free
            <span className="buttonDivider" aria-hidden="true" />
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </section>
      </main>
    </>
  );
}
