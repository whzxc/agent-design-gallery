export type ReviewCounts = {
  added: number;
  removed: number;
  moved: number;
  changed: number;
  direct: number;
  inherited: number;
};

export type ReviewFailure = {
  source: string;
  side: string;
  message: string;
};

export const reviewCounts: ReviewCounts = {
  added: 1,
  removed: 0,
  moved: 0,
  changed: 3,
  direct: 1,
  inherited: 2,
};

export const reviewEmptyCounts: ReviewCounts = {
  added: 0,
  removed: 0,
  moved: 0,
  changed: 0,
  direct: 0,
  inherited: 0,
};

export const reviewHeader = {
  label: 'agent-design-gallery',
  base: '1231094',
  head: 'working tree',
  counts: reviewCounts,
};

export const reviewFailures: ReviewFailure[] = [
  {
    source: 'design/modules/broken-card.tsx',
    side: 'working tree',
    message: 'Expected ")" but found "}" at line 28:14',
  },
];

export const reviewAddedCard = {
  source: 'design/modules/review.tsx',
  frame: 'review-header',
  status: 'added',
  theme: 'dark',
  meta: '1080×62 (2160×124px)',
  afterLabel: 'Exit review',
};

export const reviewDirectCard = {
  source: 'design/components/button.tsx',
  frame: 'primary',
  status: 'changed',
  theme: 'dark',
  meta: '120×32 (240×64px) · 184 px changed',
  beforeLabel: 'Save changes',
  afterLabel: 'Save changes',
};

export const reviewInheritedGroup = {
  causes: ['design/tokens.css'],
  count: 2,
  remainingCount: 1,
  representative: {
    source: 'design/modules/view-controls.tsx',
    frame: 'zoom-bar',
    status: 'changed',
    theme: 'dark',
    meta: '312×44 (624×88px) · 92 px changed',
    beforeLabel: '48%',
    afterLabel: '48%',
  },
};

export const reviewView = {
  ...reviewHeader,
  added: [reviewAddedCard],
  direct: [reviewDirectCard],
  inherited: [reviewInheritedGroup],
};
