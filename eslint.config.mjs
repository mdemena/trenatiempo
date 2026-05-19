import nextConfig from 'eslint-config-next'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
  {
    ignores: [
      'public/fallback-*.js',
      'public/sw.js',
      'public/workbox-*.js',
    ],
  },
  ...nextConfig,
  ...nextCoreWebVitals,
]

export default eslintConfig
