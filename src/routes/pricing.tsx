import { createFileRoute } from '@tanstack/react-router'
import { FaqSection } from '#/components/marketing/FaqSection'
import { Footer } from '#/components/marketing/Footer'
import { MarketingNavbar } from '#/components/marketing/MarketingNavbar'
import { PricingPreview } from '#/components/marketing/PricingPreview'
import { getSessionFn } from '#/lib/server/session'

export const Route = createFileRoute('/pricing')({
  loader: async () => ({ session: await getSessionFn() }),
  head: () => ({
    meta: [
      { title: 'Pricing — Trackly' },
      {
        name: 'description',
        content: 'Choose a Trackly workspace plan for your team.',
      },
    ],
  }),
  component: PricingPage,
})

function PricingPage() {
  const { session } = Route.useLoaderData()
  const isLoggedIn = !!session?.user
  return (
    <div className="landing-page min-h-screen bg-background text-foreground">
      <MarketingNavbar session={session} />
      <main>
        <PricingPreview isLoggedIn={isLoggedIn} />
        <FaqSection />
      </main>
      <Footer isLoggedIn={isLoggedIn} />
    </div>
  )
}
