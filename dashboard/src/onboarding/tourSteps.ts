export interface TourStepDef {
  id: string
  target: string
  titleKey: string
  descriptionKey: string
  route?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export const tourRegistry: Record<string, TourStepDef[]> = {
  'new-user-dashboard': [
    {
      id: 'lang-switcher',
      target: '[data-tour="lang-switcher"]',
      titleKey: 'onboarding.langSwitcher.title',
      descriptionKey: 'onboarding.langSwitcher.description',
      side: 'bottom',
    },
    {
      id: 'guide-me-btn',
      target: '[data-tour="guide-me-btn"]',
      titleKey: 'onboarding.guideMe.title',
      descriptionKey: 'onboarding.guideMe.description',
      side: 'bottom',
    },
    {
      id: 'global-search',
      target: '[data-tour="global-search"]',
      titleKey: 'onboarding.globalSearch.title',
      descriptionKey: 'onboarding.globalSearch.description',
      side: 'bottom',
    },
    {
      id: 'system-status',
      target: '[data-tour="system-status"]',
      titleKey: 'onboarding.systemStatus.title',
      descriptionKey: 'onboarding.systemStatus.description',
      side: 'bottom',
    },
    {
      id: 'sidebar-nav',
      target: '[data-tour="sidebar-nav"]',
      titleKey: 'onboarding.sidebarNav.title',
      descriptionKey: 'onboarding.sidebarNav.description',
      side: 'right',
    },
    {
      id: 'metrics-strip',
      target: '[data-tour="metrics-strip"]',
      titleKey: 'onboarding.metricsStrip.title',
      descriptionKey: 'onboarding.metricsStrip.description',
      side: 'bottom',
    },
    {
      id: 'transmission-trend',
      target: '[data-tour="transmission-trend"]',
      titleKey: 'onboarding.transmissionTrend.title',
      descriptionKey: 'onboarding.transmissionTrend.description',
      side: 'top',
    },
    {
      id: 'ward-capacity',
      target: '[data-tour="ward-capacity"]',
      titleKey: 'onboarding.wardCapacity.title',
      descriptionKey: 'onboarding.wardCapacity.description',
      side: 'left',
    },
    {
      id: 'clinical-copilot',
      target: '[data-tour="clinical-copilot"]',
      titleKey: 'onboarding.clinicalCopilot.title',
      descriptionKey: 'onboarding.clinicalCopilot.description',
      side: 'left',
    },
  ],
}
