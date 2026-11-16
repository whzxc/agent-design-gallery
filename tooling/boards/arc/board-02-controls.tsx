import { Frame } from "adg";
import { Board, Section, Group, Grid, Specimen, Matrix, Note, framesOf } from "./kit/board";
import buttonSource, { Button } from "../components/button";
import iconButtonSource from "../components/icon-button";
import fieldSource from "../components/field";
import searchSource from "../components/search";
import copyFieldSource from "../components/copy-field";
import switchSource from "../components/switch";
import choiceSource from "../components/single-choice";
import tooltipSource from "../components/tooltip";
import tagSource, { Tag } from "../components/tag";

const buttons = framesOf(buttonSource);
const iconButtons = framesOf(iconButtonSource);
const fields = framesOf(fieldSource);
const search = framesOf(searchSource);
const copyField = framesOf(copyFieldSource);
const switches = framesOf(switchSource);
const choices = framesOf(choiceSource);
const tooltip = framesOf(tooltipSource);
const tags = framesOf(tagSource);

const variants = [
  { variant: "primary", label: "Primary", note: "One per surface", text: "添加服务器", icon: "plus" },
  { variant: "secondary", label: "Secondary", note: "Default", text: "重新连接", icon: "rotate-cw" },
  { variant: "ghost", label: "Ghost", note: "Dismiss, cancel", text: "取消", icon: "x" },
  { variant: "link", label: "Link", note: "Inline navigation", text: "查看全部", icon: "arrow-right" },
  { variant: "danger", label: "Danger", note: "Destructive confirm", text: "删除", icon: "trash-2" },
  { variant: "danger-outline", label: "Danger outline", note: "Destructive entry", text: "移除账号", icon: "log-out" },
] as const;
const declared: Record<string, string> = { primary: "primary", secondary: "secondary", ghost: "ghost", danger: "danger" };

const tones = [undefined, "success", "warning", "danger", "command"] as const;

export default () => (
  <Frame name="board" width={1680}>
    <Board
      chapter="02"
      eyebrow="ARC · Components"
      title="Controls"
      intro="The controls every surface is assembled from. Captioned specimens are the declared frames themselves, imported from their sources; matrices call the same components with each variant so missing states are visible at a glance."
    >
      <Section
        title="Buttons"
        description="Capsule buttons on one 34px rail. Primary is the neutral action colour, not the accent, so the accent stays free for the source. Busy replaces the icon with a spinner and keeps the label."
        sources={["components/button.tsx", "components/icon-button.tsx"]}
      >
        <Matrix
          columns={["Label", "With icon", "Busy"]}
          rows={variants.map((v) => ({
            label: v.label,
            note: declared[v.variant] ? `${v.note} · frame “${declared[v.variant]}”` : `${v.note} · no frame`,
            cells: [
              <Button variant={v.variant}>{v.text}</Button>,
              <Button variant={v.variant} icon={v.icon}>{v.text}</Button>,
              <Button variant={v.variant} busy>{v.text}</Button>,
            ],
          }))}
        />
        <Note tone="gap">Disabled has no visual treatment in the source: the button only receives the disabled attribute. Link and danger-outline are implemented variants without declared frames.</Note>
        <Group title="Icon buttons">
          <Grid cols={5}>
            <Specimen frame={iconButtons.regular} note="36px, secondary fill" />
            <Specimen frame={iconButtons.compact} note="Compact rail" />
          </Grid>
        </Group>
      </Section>

      <Section
        title="Text input"
        description="Fields are 40px with a 12px radius, taller than buttons so a label and value read as one unit. Errors replace the helper line and tint the border; they never move the field."
        sources={["components/field.tsx", "components/search.tsx", "components/copy-field.tsx"]}
      >
        <Grid cols={4}>
          <Specimen frame={fields.field} note="Label above value" />
          <Specimen frame={fields["field-error"]} note="Inline error" />
          <Specimen frame={fields.input} note="Bare input" />
          <Specimen frame={fields["input-error"]} note="Bare input, error" />
        </Grid>
        <Grid cols={3}>
          <Specimen frame={search.default} label="search / default" note="Leading icon, placeholder only" />
          <Specimen frame={copyField.default} label="copy-field / default" note="Masked secret with copy action" wide />
        </Grid>
      </Section>

      <Section
        title="Selection"
        description="One component, SingleChoice, renders every single-select pattern: pills for a few peers, tabs for views, a dropdown when space is short, navigation for long lists with marks, and option cards for decisions that need a sentence."
        sources={["components/single-choice.tsx", "components/switch.tsx"]}
      >
        <div class="grid grid-cols-[1fr_400px] items-start gap-6">
          <div class="grid grid-cols-2 gap-x-6 gap-y-8">
            <Specimen frame={switches.on} label="switch / on" note="Accent track, white knob" />
            <Specimen frame={switches.off} label="switch / off" />
            <Specimen frame={choices.pills} label="single-choice / pills" note="Two to four peers" />
            <Specimen frame={choices.tabs} label="single-choice / tabs" note="Switches a view" />
            <Specimen frame={choices.dropdown} label="single-choice / dropdown" note="When space is short" />
            <Specimen frame={choices["option-card"]} label="single-choice / option-card" note="Decisions that need a sentence" />
          </div>
          <Specimen frame={choices.navigation} label="single-choice / navigation" note="Long lists with marks" />
        </div>
      </Section>

      <Section
        title="Tags and status"
        description="Tags label facts; they are never buttons. Status tags pair a tone with an icon so meaning survives without colour. Compact and workflow status share the tone set below."
        sources={["components/tag.tsx"]}
      >
        <Grid cols={5}>
          {["claim", "resource", "tag-meta", "tag-fact", "tag-ownership", "tag-danger", "disclosure", "status-ready", "status-missing", "status-unknown"].map((name) => (
            <Specimen frame={tags[name]} />
          ))}
        </Grid>
        <Matrix
          columns={["Neutral", "Success", "Warning", "Danger", "Command"]}
          rows={[
            { label: "Compact status", note: "Rows and capsules", cells: tones.map((tone) => <Tag form="compact-status" tone={tone} icon="circle-dot">{tone ?? "idle"}</Tag>) },
            { label: "Workflow status", note: "Task and board states", cells: tones.map((tone) => <Tag form="workflow-status" tone={tone} icon="circle-dot">{tone ?? "idle"}</Tag>) },
          ]}
        />
      </Section>

      <Section title="Tooltip" description="Dark, small and short-lived. A tooltip names an icon-only control; it never carries an action." sources={["components/tooltip.tsx"]}>
        <Grid cols={4}>
          <Specimen frame={tooltip.default} label="tooltip / default" />
        </Grid>
      </Section>
    </Board>
  </Frame>
);
