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

  'hospital-map': [
    {
      id: 'queue-panel',
      target: '[data-tour="queue-panel"]',
      titleKey: 'onboarding.hospitalMap.queues.title',
      descriptionKey: 'onboarding.hospitalMap.queues.description',
      side: 'right',
    },
    {
      id: 'resource-grid',
      target: '[data-tour="resource-grid"]',
      titleKey: 'onboarding.hospitalMap.resources.title',
      descriptionKey: 'onboarding.hospitalMap.resources.description',
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

  'simulation-lab': [
    {
      id: 'sim-controls',
      target: '[data-tour="sim-controls"]',
      titleKey: 'onboarding.simLab.controls.title',
      descriptionKey: 'onboarding.simLab.controls.description',
      side: 'bottom',
    },
    {
      id: 'strategy-switcher',
      target: '[data-tour="strategy-switcher"]',
      titleKey: 'onboarding.simLab.strategy.title',
      descriptionKey: 'onboarding.simLab.strategy.description',
      side: 'bottom',
    },
    {
      id: 'stress-injection',
      target: '[data-tour="stress-injection"]',
      titleKey: 'onboarding.simLab.stress.title',
      descriptionKey: 'onboarding.simLab.stress.description',
      side: 'top',
    },
    {
      id: 'resource-grid',
      target: '[data-tour="resource-grid"]',
      titleKey: 'onboarding.simLab.resources.title',
      descriptionKey: 'onboarding.simLab.resources.description',
      side: 'top',
    },
  ],

  'policy-testing': [
    {
      id: 'policy-runner',
      target: '[data-tour="policy-runner"]',
      titleKey: 'onboarding.policyTesting.runner.title',
      descriptionKey: 'onboarding.policyTesting.runner.description',
      side: 'bottom',
    },
    {
      id: 'policy-comparison',
      target: '[data-tour="policy-comparison"]',
      titleKey: 'onboarding.policyTesting.comparison.title',
      descriptionKey: 'onboarding.policyTesting.comparison.description',
      side: 'bottom',
    },
    {
      id: 'policy-validation',
      target: '[data-tour="policy-validation"]',
      titleKey: 'onboarding.policyTesting.validation.title',
      descriptionKey: 'onboarding.policyTesting.validation.description',
      side: 'top',
    },
  ],

  'alerts': [
    {
      id: 'alerts-banner',
      target: '[data-tour="alerts-banner"]',
      titleKey: 'onboarding.alerts.banner.title',
      descriptionKey: 'onboarding.alerts.banner.description',
      side: 'bottom',
    },
    {
      id: 'queue-panel',
      target: '[data-tour="queue-panel"]',
      titleKey: 'onboarding.hospitalMap.queues.title',
      descriptionKey: 'onboarding.hospitalMap.queues.description',
      side: 'top',
    },
  ],

  'reports': [
    {
      id: 'reports-export',
      target: '[data-tour="reports-export"]',
      titleKey: 'onboarding.reports.export.title',
      descriptionKey: 'onboarding.reports.export.description',
      side: 'bottom',
    },
    {
      id: 'policy-validation',
      target: '[data-tour="policy-validation"]',
      titleKey: 'onboarding.policyTesting.validation.title',
      descriptionKey: 'onboarding.policyTesting.validation.description',
      side: 'top',
    },
  ],

  'settings': [
    {
      id: 'settings-card',
      target: '[data-tour="settings-card"]',
      titleKey: 'onboarding.settings.card.title',
      descriptionKey: 'onboarding.settings.card.description',
      side: 'bottom',
    },
  ],
}
