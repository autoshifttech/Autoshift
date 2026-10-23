import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { SiteLayout } from './components/SiteLayout'
import { AuthProvider } from './features/auth/AuthProvider'
import AppLayout from './pages/app/AppLayout'
import InboxPage from './pages/app/InboxPage'
import WhatsAppSettingsPage from './pages/app/WhatsAppSettingsPage'
import Contact from './pages/Contact'
import Home from './pages/Home'
import Legal from './pages/Legal'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Pricing from './pages/Pricing'
import ReleaseNotes from './pages/ReleaseNotes'
import ChatButton from './pages/tools/ChatButton'
import LinkGenerator from './pages/tools/LinkGenerator'
import QrGenerator from './pages/tools/QrGenerator'
import TextFormatter from './pages/tools/TextFormatter'
import ToolsIndex from './pages/tools/ToolsIndex'
import './styles/index.css'

const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/pricing', element: <Pricing /> },
      { path: '/tools', element: <ToolsIndex /> },
      { path: '/tools/whatsapp-link-generator', element: <LinkGenerator /> },
      { path: '/tools/whatsapp-qr-code-generator', element: <QrGenerator /> },
      { path: '/tools/whatsapp-text-formatter', element: <TextFormatter /> },
      { path: '/tools/whatsapp-chat-button', element: <ChatButton /> },
      { path: '/contact', element: <Contact /> },
      { path: '/release-notes', element: <ReleaseNotes /> },
      { path: '/terms', element: <Legal kind="terms" /> },
      { path: '/privacy', element: <Legal kind="privacy" /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  { path: '/login', element: <Login /> },
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { index: true, element: <InboxPage /> },
      { path: 'settings/whatsapp', element: <WhatsAppSettingsPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
