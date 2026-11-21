// The visible Components chapters from fixtures/arc-sample.layout.json.
// Well tuples hold the frame name, chapter-relative left, section-relative top, width and height.
export const componentBoards = [
  ["Essentials", 0, 3158, [
    ["button", 220, [
      ["primary", 416, 49, 177.33, 98],
      ["secondary", 617.33, 49, 177.33, 98],
      ["ghost", 818.67, 49, 177.33, 98],
      ["danger", 1020, 49, 177.33, 98],
      ["pending", 1221.33, 49, 177.33, 98],
    ]],
    ["icon-button", 444, [
      ["regular", 416, 49, 177.33, 98],
      ["compact", 617.33, 49, 177.33, 96],
    ]],
    ["switch", 668, [
      ["on", 416, 49, 177.33, 96],
      ["off", 617.33, 49, 177.33, 96],
    ]],
    ["search", 890, [
      ["default", 416, 49, 378.67, 98],
    ]],
    ["field", 1114, [
      ["default", 416, 49, 378.67, 128],
      ["error", 818.67, 49, 378.67, 150],
    ]],
    ["tag", 1390, [
      ["meta", 416, 49, 177.33, 96],
      ["fact", 617.33, 49, 278, 96],
      ["disclosure", 919.33, 49, 177.33, 96],
      ["danger", 1120.67, 49, 177.33, 96],
      ["ownership", 1322, 49, 278, 96],
    ]],
    ["card", 1612, [
      ["default", 416, 49, 680.67, 184],
      ["reply", 416, 294, 680.67, 184],
    ]],
    ["single-choice", 2167, [
      ["pills", 416, 49, 378.67, 98],
      ["dropdown", 818.67, 49, 177.33, 98],
      ["navigation", 1020, 49, 278, 616],
      ["tabs", 1322, 49, 278, 98],
      ["option-card", 416, 726, 479.33, 108],
    ]],
  ]],
  ["Agents & quota", 1920, 1392, [
    ["quota-card", 220, [
      ["default", 416, 49, 479.33, 288],
    ]],
    ["tile", 634, [
      ["card", 416, 49, 177.33, 104],
      ["phase", 617.33, 49, 177.33, 96],
    ]],
    ["state-pill", 864, [
      ["running", 416, 49, 177.33, 96],
      ["waiting", 617.33, 49, 177.33, 96],
      ["done", 818.67, 49, 177.33, 96],
      ["failed", 1020, 49, 177.33, 96],
      ["stopped", 1221.33, 49, 177.33, 96],
    ]],
    ["effort-slider", 1086, [
      ["stepped", 416, 49, 378.67, 100],
    ]],
  ]],
  ["Tasks & interactions", 3840, 1757, [
    ["task-bubble", 220, [
      ["compact", 416, 49, 378.67, 119],
      ["standard", 818.67, 49, 378.67, 140],
      ["detailed", 1221.33, 49, 378.67, 163],
      ["row", 416, 273, 479.33, 150],
      ["row-attention", 919.33, 273, 479.33, 150],
    ]],
    ["task-message", 720, [
      ["prompt", 416, 49, 580, 110],
      ["queued", 1020, 49, 580, 142],
    ]],
    ["notice", 988, [
      ["danger", 416, 49, 680.67, 167],
      ["request-entry", 416, 277, 680.67, 140],
      ["review-unavailable", 416, 478, 680.67, 134],
    ]],
  ]],
] as const;
