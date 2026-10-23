import { Link } from 'react-router-dom'
import { brand } from '../content/brand'
import { footerGroups } from '../content/navigation'
import { Container } from './Layout'
import { Logo } from './Logo'

export function Footer() {
  return (
    <footer className="bg-ink text-white/75">
      <Container className="grid gap-12 py-14 sm:py-16 lg:grid-cols-[1.3fr_3fr]">
        <div className="max-w-sm">
          <Logo light />
          <p className="mt-4 text-sm leading-relaxed">{brand.description}</p>
          {brand.contactEmail && (
            <a href={`mailto:${brand.contactEmail}`} className="mt-4 inline-block text-sm font-semibold text-white hover:text-brand-200">
              {brand.contactEmail}
            </a>
          )}
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {footerGroups.map((group) => (
            <div key={group.label}>
              <h2 className="text-sm font-semibold text-white">{group.label}</h2>
              <ul className="mt-4 space-y-2.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} className="text-sm hover:text-white">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {brand.name}. All rights reserved.</p>
          <p>WhatsApp, Instagram and Messenger are trademarks of Meta Platforms, Inc.</p>
        </Container>
      </div>
    </footer>
  )
}
