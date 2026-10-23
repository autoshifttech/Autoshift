import { ButtonLink } from '../components/Button'
import { Container } from '../components/Layout'
import { usePageTitle } from '../hooks/usePageTitle'

export default function NotFound() {
  usePageTitle('Page not found')
  return (
    <Container className="grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <p className="text-sm font-bold text-brand-700">404</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight">This page doesn’t exist</h1>
        <p className="mt-3 text-ink-soft">The link may be broken or the page may have moved.</p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink to="/">Back to home</ButtonLink>
          <ButtonLink to="/contact?topic=support" variant="secondary">Contact support</ButtonLink>
        </div>
      </div>
    </Container>
  )
}
