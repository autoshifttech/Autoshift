# Interaction inventory

| Control | Behaviour |
|---|---|
| Product / Free tools dropdowns | Open on hover or click. Close on Escape (focus returns to the trigger), outside click, mouse leave or navigation. Items link to home anchors or tool pages |
| Mobile menu (<1024px) | Opens a drawer with a dialog role. Locks page scroll, traps focus, closes on Escape, backdrop click, the X button or a link |
| Anchor links (`/#campaigns`, …) | Navigate to the home page and scroll to the section; the sticky header is accounted for with `scroll-padding-top` |
| Start free / Sign in | `/login?mode=signup` and `/login` |
| Talk to sales | `/contact?topic=sales`, which preselects the topic |
| AI chatbot tabs | Switch the capability text and chat example (tab roles) |
| Pricing toggles | Plan family, billing period (discounts applied) and currency recalculate every card; the Creator notice says WhatsApp is not included |
| Pricing accordion | One item open at a time, `aria-expanded` |
| Link generator | Validates the number on blur. Copy, open in new tab and QR download are disabled until the link is valid |
| QR generator | Live re-render on colour or logo change. PNG 1024px, SVG (without the logo). Rejects non-images and files over 1 MB |
| Text formatter | Toolbar wraps the selection or prefixes lines; preview renders WhatsApp markers without HTML injection |
| Chat button | Live preview, copyable embed snippet with HTML-escaped values |
| Contact form | Client validation, plus a honeypot. Shows success only after the API returns 202; network or API errors show the reason and keep the input |
| Login | Email and password sign in or sign up via Supabase, or a magic link. Confirmation-email notice when required |
| Connect WhatsApp | Loads the Meta SDK, opens Embedded Signup, waits for the code and the `WA_EMBEDDED_SIGNUP` FINISH event, then posts to the API. Cancel and error messages from Meta are shown. Disabled with an explanation if not configured or the user isn't an owner or admin |
| WhatsApp settings actions | Refresh status, Retry setup (only when a step failed), Disconnect (asks for confirmation; unsubscribes and deletes the token) |
| Inbox | Lists stored messages with a Refresh button and an empty state linking to settings |
