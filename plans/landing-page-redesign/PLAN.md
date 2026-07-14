# Landing Page Redesign

> **Status:** ✅ Finished

## Status

- [x] Plan created, reviewed, and aligned with Tickr's existing brand and infrastructure.
- [x] Sprint 1: Hero + Navbar redesign implemented.
- [x] Sprint 2: Features + How It Works refresh implemented.
- [x] Sprint 3: New sections (Testimonials, Stats Banner, Pricing Preview, FAQ) implemented.
- [x] Sprint 4: CTA Band + Footer overhaul implemented.
- [x] Sprint 5: Performance, accessibility, and SEO polish completed.
- [x] Validation: typecheck, lint, production build, and browser visual QA completed.

---

## 1. Goal

Redesign Tickr's public landing page (`/`) — the first touchpoint for prospective users — from its current single-scroll page into a modern, conversion-optimized SaaS homepage. The redesign will:

1. **Visually rebrand** the page with a refined color system, updated typography hierarchy, new illustration/motion direction, and consistent spacing rhythm.
2. **Optimize for conversion** with clearer value propositions, stronger CTAs, social proof, and trust signals.
3. **Add new content sections** — pricing preview, customer testimonials, usage stats banner, and FAQ accordion — to answer buyer questions before they leave the page.
4. **Achieve aggressive performance targets** (Lighthouse ≥ 95, LCP < 1.5s, CLS < 0.05) to maintain SEO ranking and user experience.

---

## 2. Assumptions & Decisions

Since the stakeholder interview was deferred, these defaults are used. Each is marked for review.

| #   | Decision                        | Chosen Default                                                                                                                   | Alternatives                                                                  |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A1  | **Redesign scope**              | Full overhaul — new visuals, conversion structure, and new content sections.                                                     | Visual-only refresh, conversion-only restructure, content-only expansion      |
| A2  | **New sections**                | Pricing preview, testimonials, stats/metrics banner, FAQ accordion.                                                              | Also: integrations showcase, interactive demo, comparison table, blog preview |
| A3  | **Delivery strategy**           | Iterative — one section per sprint, independently deployable behind a route or at `/`.                                           | Full page cutover, A/B test rollout                                           |
| A4  | **Performance target**          | Aggressive: Lighthouse ≥ 95, LCP < 1.5s, CLS < 0.05, all images optimized, zero layout shift.                                    | Standard (good enough)                                                        |
| A5  | **Pricing preview integration** | Links to (and previews) the subscription plans from the upcoming subscription feature. Placeholder data until live.              | Standalone pricing, hardcoded pricing cards                                   |
| A6  | **Testimonials source**         | Placeholder quotes until real customer testimonials are collected; designed to swap in real data later.                          | Launch without testimonials, hardcoded fake quotes                            |
| A7  | **Branding alignment**          | Uses the same theme token system (`--primary`, theme presets) so the page respects user theme and font preferences from the app. | Hardcoded colors/typography independent of app theme                          |

---

## 3. Scope

- **Visual redesign:** Hero section, navbar, features grid, how-it-works steps, CTA band, footer.
- **New sections:** Pricing preview (3 cards), testimonials carousel/grid, stats/metrics banner, FAQ accordion.
- **Conversion optimizations:** Stronger hero headline, secondary CTA in navbar, sticky CTA on scroll, trust badges (GDPR, SSL, data residency).
- **Performance:** Image optimization (WebP/AVIF, responsive srcset), font subsetting, CSS containment, defer non-critical JS, preconnect to critical origins.
- **Accessibility:** Pass WCAG 2.1 AA — focus indicators, reduced motion support, semantic HTML, color contrast compliance, screen-reader labels.
- **SEO:** Open Graph meta tags, Twitter card, structured data (Organization + SoftwareApplication schema), canonical URL, meta description.
- **Responsive:** Mobile-first layout, touch-friendly tap targets, reduced motion on mobile if needed.

---

## 4. Out of Scope

- Blog or changelog section (these have their own routes — `/changelog`, future `/blog`).
- Interactive product demo or embedded timer (adds latency and maintenance burden; defer to post-launch).
- Multi-language/i18n support.
- A/B testing infrastructure (the iterative sprint approach replaces real-time A/B testing).
- Dark mode previews on the landing page (the page already supports theme via `--primary` tokens; no separate dark-mode-only design needed).
- Subscriber email capture / waitlist (future marketing feature).
- Changing the `/auth` (sign-in/sign-up) or `/app/*` routes.
- Altering the `MarketingNavbar`'s role in the authenticated app shell.

---

## 5. Affected Files and Folders

```txt
src/
  routes/
    index.tsx                                              (REWRITE: full landing page)
    pricing.tsx                                            (REFERENCE only — pricing preview links here)

  components/
    marketing/
      MarketingNavbar.tsx                                  (REWRITE: new design, sticky CTA)
      HeroSection.tsx                                      (NEW: extracted hero block)
      FeaturesSection.tsx                                  (NEW: extracted features grid)
      HowItWorksSection.tsx                                (NEW: extracted steps)
      TestimonialsSection.tsx                              (NEW: customer quotes)
      StatsBanner.tsx                                      (NEW: usage metrics bar)
      PricingPreview.tsx                                   (NEW: plan teaser cards)
      FaqSection.tsx                                       (NEW: accordion FAQ)
      CtaBand.tsx                                          (NEW: extracted CTA section)
      Footer.tsx                                           (NEW: extracted footer)

    ui/
      MarqueeBanner.tsx                                    (NEW: animated stats marquee — optional)
      TestimonialCard.tsx                                  (NEW: reusable testimonial card)

  lib/
    brand.ts                                               (MODIFY: add landing-specific copy constants)
    landing-content.ts                                     (NEW: centralized copy, FAQ data, testimonials)

  public/
    img/
      landing/
        hero-illustration.webp                             (NEW)
        hero-illustration.avif                             (NEW)
        testimonial-avatars/                               (NEW)
        brand-logos/                                       (NEW: client/partner logos — future)

  styles.css                                                (MODIFY: landing-specific keyframe animations)
```

---

## 6. Current State Analysis

### 6.1 What Works Well (Preserve)

| Element                                                        | Reason                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| Theme token system (`--primary`, `--primary-foreground`, etc.) | Automatically respects user theme preferences — keep as-is.         |
| `MarketingNavbar` sticky + auth-aware pattern                  | Clean, functional — needs visual refresh but not structural change. |
| Section separation with `border-t border-border`               | Clean visual breaks — maintain rhythm.                              |
| `contentVisibility: auto` on below-fold sections               | Smart perf optimization — keep and extend.                          |
| Gradient blob + grid pattern hero background                   | Distinctive, on-brand — refine but don't replace.                   |
| Timer preview in the hero                                      | Strong product visual — keep with updated styling.                  |
| Three-step "How It Works"                                      | Simple, scannable — maintain but refresh layout.                    |

### 6.2 What Needs Improvement

| Issue                    | Current State                            | Target State                                                                     |
| ------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------- |
| **Hero headline length** | Two-line with gradient text              | More punchy, value-oriented. Consider one strong line with a supporting subhead. |
| **No social proof**      | Zero testimonials, logos, or usage stats | Add testimonial quotes + stats banner.                                           |
| **No FAQ**               | Users must contact support or guess      | Add accordion FAQ covering top 5–8 questions.                                    |
| **No pricing preview**   | Users must sign up blind                 | Add 3-card pricing teaser linking to `/pricing`.                                 |
| **CTA repetition**       | Only in hero and bottom                  | Add sticky CTA in navbar on scroll, repeat mid-page.                             |
| **Footer is bare**       | Copyright + 2 links                      | Add sitemap links, legal links, social links, logo.                              |
| **No SEO meta**          | `__root.tsx` has minimal meta            | Add Open Graph, Twitter card, structured data.                                   |
| **Image optimization**   | No images currently (all CSS art)        | When illustrations are added, use WebP/AVIF + srcset.                            |
| **Accessibility**        | Not formally audited                     | Full WCAG 2.1 AA pass.                                                           |

---

## 7. Proposed Page Structure (New)

```
┌──────────────────────────────────────────────┐
│  MarketingNavbar (sticky, CTA on scroll)     │
├──────────────────────────────────────────────┤
│  HERO                                        │
│  ┌─ Badge: "Trusted by X teams"             │
│  ├─ Headline + subhead                      │
│  ├─ CTA buttons (primary + secondary)       │
│  └─ TimerPreview / illustration             │
├──────────────────────────────────────────────┤
│  STATS BANNER                                │
│  ┌─ X workspaces | Y hours tracked | Z users │
├──────────────────────────────────────────────┤
│  [INSIGHT / VALUE PROP]                      │
│  ┌─ "A calmer workspace..." + pulse metrics  │
├──────────────────────────────────────────────┤
│  FEATURES (grid)                             │
│  ┌─ 6 feature cards, refreshed visual style  │
├──────────────────────────────────────────────┤
│  HOW IT WORKS (3 steps)                      │
│  ┌─ 3 step cards, refreshed                  │
├──────────────────────────────────────────────┤
│  TESTIMONIALS                                │  ← NEW
│  ┌─ 3–4 customer quotes w/ avatars + role    │
├──────────────────────────────────────────────┤
│  PRICING PREVIEW                             │  ← NEW
│  ┌─ 3 plan cards → links to /pricing         │
├──────────────────────────────────────────────┤
│  FAQ ACCORDION                               │  ← NEW
│  ┌─ 5–8 common questions, collapsible        │
├──────────────────────────────────────────────┤
│  CTA BAND                                    │
│  ┌─ "Ready to track?" + button               │
├──────────────────────────────────────────────┤
│  FOOTER                                      │  ← EXPANDED
│  ┌─ Logo + sitemap + legal + social          │
└──────────────────────────────────────────────┘
```

---

## 8. Section-by-Section Design Spec

### 8.1 MarketingNavbar (Rewrite)

**Changes from current:**

- Add a sticky "Start free trial" CTA button that appears on scroll past the hero fold.
- Nav links become: Features, How It Works, Pricing, FAQ (remove "Insights" anchor).
- Auth state: logged-in users see "Go to dashboard" instead of "Open tracker".
- Mobile: hamburger menu with slide-out drawer.

```
Desktop:
[Logo]    Features  How It Works  Pricing  FAQ    [Theme] [Dashboard/CTA]

Mobile:
[Logo]                                [Hamburger] [Theme]
```

### 8.2 Hero Section

**Changes from current:**

- Badge: "Trusted by 500+ teams" instead of "Internal time tracking" (when stats are available; use placeholder otherwise).
- Headline: Test 2–3 variations. Candidates:
  - "Time tracking that your team will actually use." (jobs-to-be-done framing)
  - "Know where every hour goes — without the hassle." (pain-point framing)
  - Keep current: "Track every hour, across every team." (descriptive framing)
- Subhead: Shorten to one line: "Live timers, smart reports, and team visibility — all in one workspace."
- Hero stats: Keep the 3-stat grid, update values (e.g., "1 active timer" → "1-click timer").
- CTA: "Start free trial" (primary) + "See how it works" (secondary, scrolls to #how-it-works).
- Visual: Retain gradient blobs + grid pattern. Replace static TimerPreview with an animated/looping GIF or lottie of the timer if < 50 KB.

### 8.3 Stats Banner (NEW)

A full-width bar between hero and insights, styled as a subtle marquee or static grid:

```
┌──────────────┬──────────────┬──────────────┐
│    500+      │   120,000+   │    4.9/5     │
│  Workspaces  │  Hours tracked│  Team rating  │
└──────────────┴──────────────┴──────────────┘
```

Values are placeholders until real data is available. Designed as a server-rendered static bar (no JS needed).

### 8.4 Insights / Value Prop (Refresh)

**Changes from current:**

- Keep the two-column layout (text + pulse card).
- Update copy to emphasize team collaboration, not just individual tracking.
- The "Workspace pulse" mock card should use real component styling from the app for authenticity.

### 8.5 Features Grid (Refresh)

**Changes from current:**

- Increase from 6 cards to keep all 6, but use a more modern card style: icon in a colored circle, title, description.
- Add subtle hover animation (translateY -2px, shadow increase).
- Cards with `contentVisibility: auto` for lazy rendering.

### 8.6 How It Works (Refresh)

**Changes from current:**

- Replace numbered steps with a horizontal connected flow (line connecting step cards).
- Each step gets an illustration or icon that's more descriptive.
- Mobile: stack vertically with connecting line hidden.

### 8.7 Testimonials (NEW)

3–4 customer quotes in a responsive grid (3-col desktop, 2-col tablet, 1-col mobile).

Each card:

- Quote text (short, 2–3 sentences).
- Avatar (placeholder silhouette or initials until real photos).
- Name, role, company.

Design: Light border, subtle background, quote mark decorative element.

Placeholder quotes (replace with real):

- "Tickr gave our agency complete visibility into where hours go. Our billing accuracy improved overnight." — Maria S., Operations Lead
- "The one-timer rule eliminated double-counting that plagued our old spreadsheet system." — James L., Engineering Manager
- "We switched from [competitor] in a day. The team actually uses it without reminders." — Priya K., Creative Director

### 8.8 Pricing Preview (NEW)

Teaser for the subscription plans (ties into `plans/subscription-workspace-access/PLAN.md`).

Three plan cards: Starter, Professional, Enterprise.

Each card shows:

- Plan name + tagline
- Monthly price (with toggle for yearly — 15% off badge)
- 4–5 key features (checkmarks)
- CTA: "Start free trial" (Starter/Pro) or "Contact sales" (Enterprise)

Full details link: "Compare all features →" linking to `/pricing`.

If the subscription feature isn't live yet, show the pricing preview with a "Coming soon" badge and email capture. Once subscriptions are live, cards become fully functional CTAs.

### 8.9 FAQ Accordion (NEW)

5–8 collapsible questions using a Radix UI accordion (already in the project via shadcn).

Initial questions:

1. "What makes Tickr different from other time trackers?"
2. "Can I invite my whole team?"
3. "Is there a free trial?"
4. "What happens when my trial ends?"
5. "Can I export my time data?"
6. "Which payment methods do you accept?"
7. "Is my data secure?"
8. "Do you offer discounts for nonprofits or education?"

### 8.10 CTA Band (Refresh)

**Changes from current:**

- Bolder copy: "Start your 14-day free trial. No credit card required."
- Two buttons: "Start free trial" (primary) + "Talk to sales" (secondary outline).
- Keep the gradient card with decorative blobs — this pattern works well.

### 8.11 Footer (Rewrite)

Expanded from the current copyright-only footer to a proper SaaS footer:

```
[Logo]         Product          Company         Legal
               Features         About           Privacy Policy
               Pricing          Changelog       Terms of Service
               Integrations     Contact         Cookie Policy

© 2026 Trackly. All rights reserved.         [Twitter] [GitHub] [LinkedIn]
```

---

## 9. Component Breakdown

### 9.1 New Components

| Component             | File                                           | Responsibility                                         |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `HeroSection`         | `components/marketing/HeroSection.tsx`         | Hero banner with headline, subhead, CTAs, TimerPreview |
| `FeaturesSection`     | `components/marketing/FeaturesSection.tsx`     | 6-card feature grid                                    |
| `HowItWorksSection`   | `components/marketing/HowItWorksSection.tsx`   | 3-step flow                                            |
| `TestimonialsSection` | `components/marketing/TestimonialsSection.tsx` | Testimonial grid + data                                |
| `StatsBanner`         | `components/marketing/StatsBanner.tsx`         | Metrics bar                                            |
| `PricingPreview`      | `components/marketing/PricingPreview.tsx`      | 3 pricing teaser cards                                 |
| `FaqSection`          | `components/marketing/FaqSection.tsx`          | FAQ accordion                                          |
| `CtaBand`             | `components/marketing/CtaBand.tsx`             | Bottom CTA section                                     |
| `Footer`              | `components/marketing/Footer.tsx`              | Expanded site footer                                   |
| `TestimonialCard`     | `components/ui/TestimonialCard.tsx`            | Reusable testimonial display                           |

### 9.2 Refactored Components

| Component           | Change                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `MarketingNavbar`   | New visual style, scroll-aware sticky CTA, updated nav links, mobile menu                |
| `index.tsx` (route) | Becomes a thin orchestrator composing all section components; no inline JSX for sections |

### 9.3 Centralized Copy

```typescript
// src/lib/landing-content.ts

export const HERO = {
  badge: 'Trusted by 500+ teams',
  headline: 'Time tracking that your team will actually use.',
  subhead: 'Live timers, smart reports, and team visibility — all in one workspace.',
  primaryCta: 'Start free trial',
  secondaryCta: 'See how it works',
}

export const STATS = [
  { value: '500+', label: 'Workspaces' },
  { value: '120,000+', label: 'Hours tracked' },
  { value: '4.9/5', label: 'Team rating' },
]

export const TESTIMONIALS = [
  {
    quote: 'Tickr gave our agency complete visibility into where hours go...',
    name: 'Maria S.',
    role: 'Operations Lead',
    company: 'DesignCraft Agency',
  },
  // ...
]

export const FAQ_ITEMS = [
  { question: '...', answer: '...' },
  // ...
]

export const FEATURES = [
  { icon: 'Clock', title: 'One active timer', body: '...' },
  // ...
]

export const PRICING_PLANS = [
  { name: 'Starter', price: '₱499', ... },
  // ...
]
```

This makes copy changes trivial (no component edits needed) and enables future CMS integration.

---

## 10. Performance Budget

| Metric                     | Current (est.)            | Target               |
| -------------------------- | ------------------------- | -------------------- |
| **Lighthouse Performance** | ~92                       | ≥ 95                 |
| **LCP**                    | ~2.0s                     | < 1.5s               |
| **CLS**                    | ~0.02                     | < 0.05 (maintain)    |
| **TTFB**                   | ~300ms                    | < 200ms              |
| **Total page weight**      | ~120 KB (CSS + JS + HTML) | < 200 KB with images |
| **First contentful paint** | ~1.2s                     | < 1.0s               |

**Techniques:**

- `contentVisibility: auto` on all below-fold sections (already used, extend to new sections).
- Images: WebP + AVIF with `<picture>` fallback, responsive `srcset`, explicit `width`/`height` to prevent CLS.
- Font: Subset to Latin + common punctuation only; use `font-display: swap` (already configured via Tailwind).
- JS: No new JS dependencies beyond what's already in the bundle (React, TanStack Router). FAQ accordion uses Radix which is already imported.
- CSS: Tailwind purges unused classes in production (already configured). Landing-specific keyframes in `styles.css` are minimal.
- Preconnect: Add `<link rel="preconnect">` for image origin if using a CDN.

---

## 11. Accessibility Checklist

| Requirement             | Implementation                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| **Semantic HTML**       | `<header>`, `<main>`, `<section>`, `<footer>`, `<nav>` with `aria-label`                         |
| **Heading hierarchy**   | Single `<h1>` in hero, `<h2>` for section titles, `<h3>` for card titles                         |
| **Focus indicators**    | Visible `:focus-visible` rings on all interactive elements (already configured)                  |
| **Reduced motion**      | `prefers-reduced-motion: reduce` disables hero parallax, hover animations, marquee               |
| **Color contrast**      | All text meets 4.5:1 ratio against background (enforced by theme tokens)                         |
| **Alt text**            | All images have descriptive `alt`; decorative images use `alt=""`                                |
| **Keyboard navigation** | Tab order follows visual order; skip-link to main content                                        |
| **Screen readers**      | `aria-label` on icon-only buttons; `aria-expanded` on accordion; `aria-live` for dynamic content |
| **Touch targets**       | Minimum 44×44px tap targets on mobile (Tailwind `min-h-[44px]`)                                  |

---

## 12. SEO Specifications

```html
<!-- Open Graph -->
<meta
  property="og:title"
  content="Trackly — Time tracking that your team will actually use"
/>
<meta
  property="og:description"
  content="Live timers, smart reports, and team visibility — all in one workspace. Start your 14-day free trial."
/>
<meta
  property="og:image"
  content="https://tickr.example.com/img/og-landing.png"
/>
<meta property="og:type" content="website" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta
  name="twitter:title"
  content="Trackly — Time tracking your team will use"
/>
<meta
  name="twitter:image"
  content="https://tickr.example.com/img/og-landing.png"
/>

<!-- Structured Data -->
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Trackly",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "description": "Workspace time tracking for teams.",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "PHP",
      "description": "14-day free trial"
    }
  }
</script>

<!-- Canonical -->
<link rel="canonical" href="https://tickr.example.com/" />
```

---

## 13. Sequencing (Implementation Order)

### Sprint 1: Foundation + Hero + Navbar

1. Create `src/lib/landing-content.ts` with all copy, testimonials, FAQ data.
2. Create `HeroSection.tsx` — extracted from current `index.tsx`, redesigned.
3. Create new `MarketingNavbar.tsx` — scroll-aware sticky CTA, updated nav links, mobile menu.
4. Wire into `index.tsx` route — route becomes thin orchestrator.
5. Add Open Graph / Twitter Card / structured data to `__root.tsx` head.

### Sprint 2: Core Sections Refresh

6. Create `FeaturesSection.tsx` — refreshed 6-card grid.
7. Create `HowItWorksSection.tsx` — refreshed 3-step flow.
8. Create `CtaBand.tsx` — updated copy + styling.
9. Create `Footer.tsx` — expanded sitemap footer.

### Sprint 3: New Sections

10. Create `StatsBanner.tsx` — metrics bar with placeholder data.
11. Create `TestimonialsSection.tsx` + `TestimonialCard.tsx` — 3–4 quotes.
12. Create `PricingPreview.tsx` — 3 plan cards (with "Coming soon" badge if subscriptions not live).
13. Create `FaqSection.tsx` — accordion with 5–8 questions.

### Sprint 4: Polish + Responsive

14. Mobile-first responsive pass on all sections.
15. Add `prefers-reduced-motion` support.
16. Cross-browser visual QA (Chrome, Firefox, Safari, mobile Safari, mobile Chrome).
17. Accessibility audit and remediation.

### Sprint 5: Performance + Launch

18. Lighthouse audit — close any gaps below 95.
19. Image generation and optimization (hero illustration, OG image, testimonial avatars).
20. Final copy review with stakeholders.
21. Deploy and monitor Core Web Vitals in production.

---

## 14. Risks & Considerations

| Risk                                     | Impact                                              | Mitigation                                                                          |
| ---------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Regressions on existing landing page** | Current users see broken page                       | Iterative sprints with independent deploy; each section is self-contained           |
| **Performance regression**               | New images, JS, CSS bloat the bundle                | Enforce performance budget per sprint; Lighthouse CI in PR checks                   |
| **Copy not finalized**                   | Placeholder copy goes live, hurts credibility       | Centralize all copy in `landing-content.ts`; easy to swap before launch             |
| **Subscription not live yet**            | Pricing preview CTAs are dead links                 | Add "Coming soon" badge + email capture as fallback                                 |
| **No real testimonials**                 | Fake quotes damage trust                            | Use placeholder design clearly marked; swap with real quotes from beta users ASAP   |
| **Mobile menu complexity**               | Custom mobile nav introduces a11y bugs              | Use Radix NavigationMenu or Dialog primitives already in the project                |
| **SEO impact of redesign**               | Rankings drop if content/structure changes too much | Preserve heading hierarchy; add structured data; monitor Search Console post-launch |
| **CLS from dynamic content**             | Stats banner, animations cause layout shifts        | Reserve space with explicit dimensions; no injected content above the fold          |

---

## 15. Open Questions

- [ ] **Final headline** — Confirm which of the 3 headline candidates (or a new one) to use.
- [ ] **Real stats** — What are the actual workspace/user/hour counts? Use placeholders or real data at launch?
- [ ] **Testimonial collection** — Do we have beta users willing to provide quotes for launch?
- [ ] **Hero illustration** — Custom illustration or keep the TimerPreview code component?
- [ ] **Social media links** — Which social profiles (if any) should be in the footer?
- [ ] **Pricing page dependency** — Should the pricing preview link to `/pricing` before the subscription feature is live, or be gated?
- [ ] **Legal pages** — Do Privacy Policy, Terms of Service, and Cookie Policy pages exist? Where do they live?
- [ ] **Newsletter/email capture** — Add a "Get notified" email input in the pricing preview if subscriptions aren't live?
