import { Frame } from "adg";
import { Board, Section, Group, Grid, Note } from "./kit/board";
import { light, dark } from "./kit/tokens";
import { BrandMark, type Brand } from "../components/brand-mark";
import { ThemeSwatch } from "../components/theme-swatch";

const palette = [
  { title: "表面", note: "canvas 垫在最底层，各级 surface 从凹陷到凸起依次叠在其上。", tokens: ["canvas", "surface", "surface-raised", "surface-subtle", "surface-sunken", "border", "border-strong"] },
  { title: "文字", note: "三级强调。tertiary 只用于元信息，不用于可操作的内容。", tokens: ["text", "text-secondary", "text-tertiary"] },
  { title: "操作与强调", note: "action 是中性的主操作色；accent 用来标记来源与链接。", tokens: ["action", "on-action", "accent", "accent-text", "on-accent", "knob"] },
  { title: "状态", note: "状态色只承载语义，必须搭配图标或文字。", tokens: ["success", "warning", "danger"] },
  { title: "角色与阶段", note: "谁在行动，以及运行中的任务正在做什么。", tokens: ["role-source", "role-agent", "phase-thinking", "phase-text", "phase-command", "phase-file"] },
];

function Swatch({ token }: { token: string }) {
  return (
    <div class="flex flex-col gap-2">
      <div class="flex h-[72px] overflow-hidden rounded-tile border border-border">
        <div class="flex-1 bg-(--swatch)" style={`--swatch:var(--${token})`} />
        <div class="flex-1 bg-(--swatch-dark)" data-brand="token-specimen" style={`--swatch-dark:${dark[token]}`} />
      </div>
      <div class="flex flex-col">
        <span class="font-mono text-meta text-text">--{token}</span>
        <span class="font-mono text-caption text-text-tertiary">{light[token]} · {dark[token]}</span>
      </div>
    </div>
  );
}

const typeScale = [
  { token: "display", sample: "连接你的第一个 Agent", cls: "text-display font-semibold", spec: "28 · 600" },
  { token: "title", sample: "MCP 服务", cls: "text-title leading-title font-[650]", spec: "18 / 24 · 650" },
  { token: "body", sample: "Agent 会在这台设备上运行，并向你请求权限。", cls: "text-body leading-body", spec: "14 / 20 · 400" },
  { token: "small", sample: "重新连接 · 添加服务器 · 打开任务详情", cls: "text-small leading-small font-semibold", spec: "13 / 18 · 600" },
  { token: "meta", sample: "2 分钟前 · 正在运行 · Pro 500", cls: "text-meta leading-compact", spec: "12 / 16 · 400" },
  { token: "caption", sample: "AGENT · SOURCE · 已授权", cls: "text-caption", spec: "11 · 400" },
];

const families = [
  { token: "font-ui", cls: "font-ui", sample: "Agent Remote Control 远程控制" },
  { token: "font-mono", cls: "font-mono", sample: "arc dispatch --pack coding-segment" },
  { token: "font-rounded", cls: "font-rounded", sample: "12 · 48% · 3/5" },
  { token: "font-lettermark", cls: "font-lettermark", sample: "Aa Bb 01" },
];

const radii = [
  { token: "radius-rail", cls: "rounded-(--radius-rail)" },
  { token: "radius-progress", cls: "rounded-(--radius-progress)" },
  { token: "radius-disclosure", cls: "rounded-(--radius-disclosure)" },
  { token: "radius-tile", cls: "rounded-tile" },
  { token: "radius-field", cls: "rounded-field" },
  { token: "radius-switch", cls: "rounded-switch" },
  { token: "radius-inset", cls: "rounded-(--radius-inset)" },
  { token: "radius-control", cls: "rounded-control" },
  { token: "radius-card", cls: "rounded-card" },
  { token: "radius-panel", cls: "rounded-panel" },
  { token: "radius-pill", cls: "rounded-pill" },
];

const elevations = [
  { token: "shadow-sm", cls: "shadow-sm", use: "开关滑块、选中的分段" },
  { token: "shadow-md", cls: "shadow-md", use: "卡片与弹出层" },
  { token: "shadow-lg", cls: "shadow-lg", use: "面板与对话框" },
  { token: "shadow-focus", cls: "shadow-focus", use: "键盘焦点环" },
];

const sizes = [
  { token: "control-height", cls: "h-(--control-height)" },
  { token: "control-height-compact", cls: "h-(--control-height-compact)" },
  { token: "field-height", cls: "h-(--field-height)" },
  { token: "dock-button-size", cls: "h-(--dock-button-size)" },
  { token: "switch-height", cls: "h-(--switch-height)" },
  { token: "switch-thumb-size", cls: "h-(--switch-thumb-size)" },
  { token: "control-icon-size", cls: "h-(--control-icon-size)" },
  { token: "field-icon-size", cls: "h-(--field-icon-size)" },
];

const bezier = (value: string) => value.match(/[\d.]+/g)!.map(Number);
const motions = [
  { token: "ease-enter", use: "面板与弹出层进入" },
  { token: "ease-exit", use: "离开屏幕" },
];
const durations = ["motion-fast", "motion-base", "motion-panel", "motion-running"];

const swatchThemes = ["default", "blue", "purple", "orange", "green"];
const brands: Brand[] = ["claude-code", "codex", "claude", "openai", "anthropic", "google", "deepseek", "xai", "microsoft", "cursor", "opencode", "raycast", "notion", "slack", "alibaba", "pi"];

export default () => (
  <Frame name="board" width={1680}>
    <Board
      chapter="01"
      eyebrow="ARC · 设计系统"
      title="基础"
      intro="界面用到的每个取值都来自 design/tokens.css。本板直接读取浅色和深色两组 token，所以每个色块同时展示两种主题，token 一改这里就跟着变。"
    >
      <Section title="颜色" description="浅色是暖纸色，深色是暖炭色。每个色块左半是浅色值、右半是深色值。上色只引用角色 token，从不直接写十六进制。" sources={["design/tokens.css"]}>
        {palette.map((group) => (
          <Group title={group.title} note={group.note}>
            <Grid cols={7}>{group.tokens.map((token) => <Swatch token={token} />)}</Grid>
          </Group>
        ))}
      </Section>

      <Section title="字体" description="整个产品只用一套系统 UI 字体。字号档位少、按角色命名，其余层级靠字重拉开。中英文共用同一套字号。">
        <div class="flex flex-col">
          {typeScale.map((row) => (
            <div class="grid grid-cols-[160px_1fr_160px] items-baseline gap-6 border-b border-border py-4">
              <span class="font-mono text-meta text-text-secondary">--text-{row.token}</span>
              <span class={row.cls}>{row.sample}</span>
              <span class="text-right font-mono text-meta text-text-tertiary">{row.spec}</span>
            </div>
          ))}
        </div>
        <Group title="字族">
          <Grid cols={4}>
            {families.map((family) => (
              <div class="flex flex-col gap-2 rounded-card bg-canvas px-5 py-4">
                <span class={`${family.cls} text-title`}>{family.sample}</span>
                <span class="font-mono text-caption text-text-tertiary">--{family.token}</span>
              </div>
            ))}
          </Grid>
        </Group>
      </Section>

      <Section title="形状" description="圆角随物体尺寸增大：轨道和进度条近乎直角，控件是胶囊形，面板最柔和。">
        <div class="grid grid-cols-11 gap-4">
          {radii.map((radius) => (
            <div class="flex flex-col items-center gap-3">
              <div class={`size-[88px] border border-border-strong bg-surface-subtle ${radius.cls}`} />
              <span class="text-center font-mono text-caption text-text-secondary">{radius.token.replace("radius-", "")}</span>
              <span class="font-mono text-caption text-text-tertiary">{light[radius.token]}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="阴影层级" description="阴影偏暖、偏低。大部分界面平铺在 canvas 上，只有浮在其上的东西才用阴影。">
        <div class="grid grid-cols-4 gap-8 rounded-card bg-canvas p-10">
          {elevations.map((elevation) => (
            <div class="flex flex-col gap-4">
              <div class={`h-[120px] rounded-card bg-surface ${elevation.cls}`} />
              <div class="flex flex-col">
                <span class="font-mono text-meta">--{elevation.token}</span>
                <span class="text-meta text-text-tertiary">{elevation.use}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="尺寸" description="控件高度都是 token，同一行里的按钮、输入框和开关因此能对齐在同一条轨道上。">
        <div class="grid grid-cols-8 gap-6 rounded-card bg-canvas px-8 pt-8 pb-6">
          {sizes.map((size) => (
            <div class="flex flex-col gap-3">
              <div class="flex h-[48px] items-end">
                <div class={`${size.cls} w-full rounded-[4px] border border-accent/40 bg-accent/20`} />
              </div>
              <div class="flex flex-col gap-[2px]">
                <span class="font-mono text-caption text-text-secondary">{size.token}</span>
                <span class="font-mono text-caption text-text-tertiary">{light[size.token]}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="动效" description="短促、果断。面板用先快后慢的曲线进入、用加速曲线离开；只有运行中的工作会循环播放。">
        <div class="grid grid-cols-[1fr_1fr_1.2fr] gap-6">
          {motions.map((motion) => {
            const [x1, y1, x2, y2] = bezier(light[motion.token]);
            return (
              <div class="flex flex-col gap-3 rounded-card bg-canvas p-6">
                <svg data-free viewBox="-4 -4 108 108" class="h-[140px] w-full overflow-visible">
                  <path d="M0 100 L100 100 M0 100 L0 0" class="fill-none stroke-border-strong" stroke-width="1" />
                  <path d={`M0 100 C${x1 * 100} ${100 - y1 * 100} ${x2 * 100} ${100 - y2 * 100} 100 0`} class="fill-none stroke-accent" stroke-width="2.5" />
                </svg>
                <span class="font-mono text-meta">--{motion.token}</span>
                <span class="text-meta text-text-tertiary">{motion.use} · {light[motion.token]}</span>
              </div>
            );
          })}
          <div class="flex flex-col justify-between gap-3 rounded-card bg-canvas p-6">
            {durations.map((duration) => (
              <div class="grid grid-cols-[140px_1fr_60px] items-center gap-4">
                <span class="font-mono text-meta">--{duration}</span>
                <div class="h-2 rounded-pill bg-accent w-(--bar)" style={`--bar:${Math.min(100, parseInt(light[duration]) / 4)}%`} />
                <span class="text-right font-mono text-meta text-text-tertiary">{light[duration]}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="标识" description="Agent 与平台标识是自带颜色的图稿。主题色块预览用户可选的强调色组合。">
        <Group title="Agent 与平台">
          <div class="grid grid-cols-8 gap-4">
            {brands.map((brand) => (
              <div class="flex flex-col items-center gap-2 rounded-card bg-canvas py-5">
                <BrandMark brand={brand} size={38} />
                <span class="font-mono text-caption text-text-tertiary">{brand}</span>
              </div>
            ))}
          </div>
        </Group>
        <Group title="主题色块">
          <div class="flex gap-6">
            {swatchThemes.map((theme) => (
              <div class="flex items-center gap-2 rounded-pill bg-canvas py-2 pr-4 pl-2">
                <span class="scale-150"><ThemeSwatch value={theme} /></span>
                <span class="ml-1 font-mono text-caption text-text-secondary">{theme}</span>
              </div>
            ))}
          </div>
        </Group>
        <Note>这里省略了 Antigravity 标识：它是库里最大的一份图稿，而且这个 Agent 已经不再使用。</Note>
      </Section>
    </Board>
  </Frame>
);
