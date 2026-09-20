import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.pulsegrid.app',
  appName: 'PulseGrid',
  webDir: 'dist',
  server: {
    url: 'http://192.168.0.110:5173',
    cleartext: true,
    androidScheme: 'https',
  },
}

export default config
