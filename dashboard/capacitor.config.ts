import type { CapacitorConfig } from '@capacitor/cli'

const isDev = process.env.NODE_ENV !== 'production' && process.env.CAPACITOR_ENV !== 'production'
const allowCleartext = process.env.CAPACITOR_CLEARTEXT === 'true' || (isDev && process.env.CAPACITOR_CLEARTEXT !== 'false')

const config: CapacitorConfig = {
  appId: 'com.medflow.app',
  appName: 'MedFlow',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: allowCleartext,
  },
}

export default config
