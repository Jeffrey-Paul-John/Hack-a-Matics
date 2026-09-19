import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.medflow.sentinel',
  appName: 'MedFlow Sentinel',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
}

export default config
