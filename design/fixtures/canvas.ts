export const boardChapterSpecimen = {
  number: 1,
  project: 'agent-design-gallery',
  layer: 'Components',
  title: 'Controls',
  sourceCount: 2,
  frameCount: 5,
  width: 1280,
  sections: [
    {
      title: 'button',
      path: 'design/components/button.tsx',
      modified: 'Nov 18, 09:42',
      copied: true,
      specimens: [
        { name: 'primary', span: 4, selected: true, kind: 'button', props: { form: 'primary', label: 'Unlock' } },
        { name: 'secondary', span: 4, kind: 'button', props: { form: 'secondary', label: 'Cancel' } },
        { name: 'ghost', span: 4, note: 'Inline secondary action.', kind: 'button', props: { form: 'ghost', label: 'Reset' } },
      ],
    },
    {
      title: 'icon-button',
      path: 'design/components/icon-button.tsx',
      modified: 'Nov 18, 09:18',
      selected: true,
      specimens: [
        { name: 'default', span: 4, kind: 'icon-button', props: { icon: 'panel-right', label: 'Inspector' } },
        {
          name: 'accent',
          span: 4,
          proposed: 'comment-tool',
          kind: 'icon-button',
          props: { form: 'accent', icon: 'message-square-plus', label: 'Comment' },
        },
      ],
    },
  ],
};

export const minimapSpecimen = {
  boxes: [
    [16, 16, 70, 44],
    [94, 16, 90, 60],
    [16, 68, 70, 48],
  ],
  viewport: [90, 12, 98, 68],
};
