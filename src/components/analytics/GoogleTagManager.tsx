'use client'

import Script from 'next/script'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { CONSENT_COOKIE, readConsent, applyConsent } from '@/lib/consent'

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID

export function GoogleTagManager() {
  const pathname = usePathname()
  const isFirstLoad = useRef(true)

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      return
    }
    if (!GTM_ID) return
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event: 'page_view', page_path: pathname })
  }, [pathname])

  // Re-aplicar el consentimiento ya guardado al montar (por si GTM carga después)
  useEffect(() => {
    const consent = readConsent()
    if (consent) applyConsent(consent)
  }, [])

  if (!GTM_ID) return null

  return (
    <>
      {/* Consent Mode v2 — defaults antes de que cargue GTM. Si el usuario ya
          decidió, se respeta su elección para no perder medición del primer hit */}
      <Script id="gtm-consent-defaults" strategy="beforeInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        (function(){
          var c=(document.cookie.match(new RegExp('(?:^|; )${CONSENT_COOKIE}=([^;]*)'))||[])[1];
          var analytics = c === 'analytics' ? 'granted' : 'denied';
          gtag('consent','default',{
            analytics_storage: analytics,
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            wait_for_update: 500
          });
        })();
      `}</Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
          title="Google Tag Manager"
        />
      </noscript>
      <Script id="gtm" strategy="afterInteractive">{`
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${GTM_ID}');
      `}</Script>
    </>
  )
}