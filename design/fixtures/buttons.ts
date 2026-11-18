const buttonLabels = {
  unlock: 'Unlock',
  rescan: 'Rescan',
  ghost: 'Components',
  zoom: '48%',
};

export const buttonForms = [
  { name: 'primary', form: 'primary', label: buttonLabels.unlock },
  { name: 'secondary', form: 'secondary', label: buttonLabels.rescan, icon: 'refresh-cw' },
  { name: 'ghost', form: 'ghost', label: buttonLabels.ghost },
  { name: 'disabled', form: 'primary', label: buttonLabels.unlock, disabled: true },
  { name: 'zoom', form: 'zoom', label: buttonLabels.zoom },
  { name: 'zoom-open', form: 'zoom-open', label: buttonLabels.zoom },
];

export const iconButtonForms = ['default', 'active', 'pressed', 'accent'];

export const disabledIconButton = { icon: 'arrow-left', disabled: true };
