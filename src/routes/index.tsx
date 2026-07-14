import { createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { CtaBand } from '#/components/marketing/CtaBand'
import { FaqSection } from '#/components/marketing/FaqSection'
import { FeaturesSection } from '#/components/marketing/FeaturesSection'
import { Footer } from '#/components/marketing/Footer'
import { HeroSection } from '#/components/marketing/HeroSection'
import { HowItWorksSection } from '#/components/marketing/HowItWorksSection'
import { MarketingNavbar } from '#/components/marketing/MarketingNavbar'
import { PricingPreview } from '#/components/marketing/PricingPreview'
import { StatsBanner } from '#/components/marketing/StatsBanner'
import { TestimonialsSection } from '#/components/marketing/TestimonialsSection'
import { WorkspacePreviewSection } from '#/components/marketing/WorkspacePreviewSection'
import { BRAND } from '#/lib/brand'
import { getSessionFn } from '#/lib/server/session'
import { useInView } from '#/hooks/useInView'

const title = `${BRAND.name} — Time tracking your team will actually use`
const description =
  'Live timers, clean reports, and team visibility in one calm workspace.'
const siteUrl = 'https://tickr-nu.vercel.app/'
const softwareSchema = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: BRAND.name,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description,
  url: siteUrl,
})

export const Route = createFileRoute('/')({
  loader: async () => {
    const session = await getSessionFn()
    return { session }
  },
  head: () => ({
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: siteUrl },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ],
    links: [{ rel: 'canonical', href: siteUrl }],
  }),
  component: HomePage,
})

function HomePage() {
  const { session } = Route.useLoaderData()
  const isLoggedIn = !!session?.user

  return (
    <div className="landing-page relative isolate min-h-screen overflow-clip bg-background text-foreground">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-50 -translate-y-20 border border-primary bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <div className="landing-scroll-progress" aria-hidden="true" />
      <div className="landing-ambient-layer" aria-hidden="true">
        <span className="landing-ambient-dot landing-ambient-dot-one" />
        <span className="landing-ambient-dot landing-ambient-dot-two" />
        <span className="landing-ambient-dot landing-ambient-dot-three" />
      </div>
      <script type="application/ld+json">{softwareSchema}</script>
      <MarketingNavbar session={session} />
      <main id="main-content">
        <div className="landing-hero-stage">
          <HeroSection isLoggedIn={isLoggedIn} />
        </div>
        <LandingReveal direction="up" className="landing-stats-stage">
          <StatsBanner />
        </LandingReveal>
        <LandingReveal direction="left">
          <WorkspacePreviewSection />
        </LandingReveal>
        <LandingReveal direction="right">
          <FeaturesSection />
        </LandingReveal>
        <LandingReveal direction="up">
          <HowItWorksSection />
        </LandingReveal>
        <LandingReveal direction="left">
          <TestimonialsSection />
        </LandingReveal>
        <LandingReveal direction="right">
          <PricingPreview isLoggedIn={isLoggedIn} />
        </LandingReveal>
        <LandingReveal direction="up">
          <FaqSection />
        </LandingReveal>
        <LandingReveal direction="up" className="landing-cta-stage">
          <CtaBand isLoggedIn={isLoggedIn} />
        </LandingReveal>
      </main>
      <Footer isLoggedIn={isLoggedIn} />
    </div>
  )
}

function LandingReveal({
  children,
  direction,
  className = '',
}: {
  children: ReactNode
  direction: 'up' | 'left' | 'right'
  className?: string
}) {
  const { ref, inView } = useInView()

  return (
    <div
      ref={ref}
      data-visible={inView}
      data-direction={direction}
      className={`landing-reveal ${className}`}
    >
      {children}
    </div>
  )
}
