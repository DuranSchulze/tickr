export const HERO = {
  eyebrow: 'Built for focused teams',
  headline: 'Time tracking your team will actually use.',
  subhead:
    'Live timers, clean reports, and team visibility in one calm workspace.',
  primaryCta: 'Create your workspace',
  secondaryCta: 'See how it works',
} as const

export const PRODUCT_SIGNALS = [
  { value: '1-click', label: 'Start and stop tracking' },
  { value: '4 roles', label: 'Clear workspace access' },
  { value: 'Day → month', label: 'Flexible reporting' },
] as const

export const FEATURES = [
  {
    icon: 'timer',
    title: 'One active timer',
    body: 'Keep every hour clean with one running timer per teammate.',
  },
  {
    icon: 'layers',
    title: 'Organized work',
    body: 'Connect entries to projects, tasks, clients, and tags.',
  },
  {
    icon: 'users',
    title: 'Team structure',
    body: 'Group people by department, cohort, and responsibility.',
  },
  {
    icon: 'chart',
    title: 'Useful reports',
    body: 'Review daily, weekly, and monthly totals without spreadsheet cleanup.',
  },
  {
    icon: 'shield',
    title: 'Role-based access',
    body: 'Give owners, admins, managers, and members the right level of visibility.',
  },
  {
    icon: 'export',
    title: 'Data that moves',
    body: 'Export reports and connect workspace data to Google Sheets.',
  },
] as const

export const WORKFLOW_STEPS = [
  {
    icon: 'user-plus',
    number: '01',
    title: 'Set up your team',
    body: 'Create a workspace, invite teammates, and define who can see what.',
  },
  {
    icon: 'play',
    number: '02',
    title: 'Track the work',
    body: 'Start a timer or add an entry manually, then attach the right context.',
  },
  {
    icon: 'sparkles',
    number: '03',
    title: 'Turn time into clarity',
    body: 'Scan activity, compare periods, and export a report when you need it.',
  },
] as const

export const PLAN_PREVIEWS = [
  {
    name: 'Team',
    price: 20,
    tagline: 'Everything a growing team needs to track and report its work.',
    features: [
      'Live timers and manual time entries',
      'Projects, clients, tasks, and tags',
      'Daily, weekly, and monthly reports',
      'Report exports',
      'Team invitations',
    ],
    featured: false,
  },
  {
    name: 'Business',
    price: 50,
    tagline:
      'More structure, oversight, and integrations for established teams.',
    features: [
      'Everything in Team',
      'Departments and cohorts',
      'Role-based workspace access',
      'Team and member analytics',
      'Google Sheets integration',
      'Audit logs and API access',
    ],
    featured: true,
  },
] as const

export const FAQ_ITEMS = [
  {
    question: 'What makes Trackly different from a basic timer?',
    answer:
      'Trackly connects each entry to the people, projects, clients, tasks, and tags around it. That gives the whole team useful context without making daily tracking feel heavy.',
  },
  {
    question: 'Can I invite and organize my whole team?',
    answer:
      'Yes. Workspaces support invitations, departments, cohorts, and role-based access for owners, admins, managers, and members.',
  },
  {
    question: 'Can teammates add time manually?',
    answer:
      'Yes. Teams can use live timers or create manual entries, with safeguards that help avoid overlapping time.',
  },
  {
    question: 'Which reporting periods are available?',
    answer:
      'Trackly includes day, week, and month views, plus workspace analytics for reviewing activity across people and projects.',
  },
  {
    question: 'Can I export my time data?',
    answer:
      'Yes. Reports can be exported for further analysis, billing workflows, or sharing, and workspaces can also connect to Google Sheets.',
  },
  {
    question: 'How much does Trackly cost?',
    answer:
      'Trackly offers two monthly plans in USD: Team at $20 per month and Business at $50 per month. The Business plan adds workspace structure, advanced analytics, integrations, audit logs, and API access.',
  },
] as const
