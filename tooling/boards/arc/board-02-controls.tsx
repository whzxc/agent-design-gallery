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

const buttons = framesOf(buttonSource, "components/button.tsx");
const iconButtons = framesOf(iconButtonSource, "components/icon-button.tsx");
const fields = framesOf(fieldSource, "components/field.tsx");
const search = framesOf(searchSource, "components/search.tsx");
const copyField = framesOf(copyFieldSource, "components/copy-field.tsx");
const switches = framesOf(switchSource, "components/switch.tsx");
const choices = framesOf(choiceSource, "components/single-choice.tsx");
const tooltip = framesOf(tooltipSource, "components/tooltip.tsx");
const tags = framesOf(tagSource, "components/tag.tsx");

const variants = [
  { variant: "primary", label: "Primary", note: "每个界面一个", text: "添加服务器", icon: "plus" },
  { variant: "secondary", label: "Secondary", note: "默认", text: "重新连接", icon: "rotate-cw" },
  { variant: "ghost", label: "Ghost", note: "关闭、取消", text: "取消", icon: "x" },
  { variant: "link", label: "Link", note: "行内跳转", text: "查看全部", icon: "arrow-right" },
  { variant: "danger", label: "Danger", note: "确认破坏性操作", text: "删除", icon: "trash-2" },
  { variant: "danger-outline", label: "Danger outline", note: "破坏性操作入口", text: "移除账号", icon: "log-out" },
] as const;
const declared: Record<string, string> = { primary: "primary", secondary: "secondary", ghost: "ghost", danger: "danger" };

const tones = [undefined, "success", "warning", "danger", "command"] as const;

export default () => (
  <Frame name="board" width={1680}>
    <Board
      chapter="02"
      eyebrow="ARC · 组件"
      title="控件"
      intro="所有界面都由这些控件拼出来。带标注的样本就是源文件里声明的 frame 本身；矩阵直接用每个变体调用同一组件，缺失的状态一眼可见。"
    >
      <Section
        title="按钮"
        description="胶囊按钮统一在 34px 轨道上。primary 用中性的 action 色而不是 accent，accent 留给来源标记。忙碌态用转圈替换图标，文字保留。"
        sources={["components/button.tsx", "components/icon-button.tsx"]}
      >
        <Matrix
          columns={["纯文字", "带图标", "忙碌"]}
          rows={variants.map((v) => ({
            label: v.label,
            note: declared[v.variant] ? `${v.note} · frame “${declared[v.variant]}”` : `${v.note} · 无 frame`,
            cells: [
              <Button variant={v.variant}>{v.text}</Button>,
              <Button variant={v.variant} icon={v.icon}>{v.text}</Button>,
              <Button variant={v.variant} busy>{v.text}</Button>,
            ],
          }))}
        />
        <Note tone="gap">源文件里禁用态没有视觉处理，按钮只拿到 disabled 属性。link 和 danger-outline 已实现，但没有声明 frame。</Note>
        <Group title="图标按钮">
          <Grid cols={5}>
            <Specimen frame={iconButtons.regular} note="36px，secondary 填充" />
            <Specimen frame={iconButtons.compact} note="紧凑轨道" />
          </Grid>
        </Group>
      </Section>

      <Section
        title="文本输入"
        description="输入框 40px 高、12px 圆角，比按钮高，让标签和值读起来是一个整体。错误信息替换辅助说明并给边框着色，不会挤动输入框。"
        sources={["components/field.tsx", "components/search.tsx", "components/copy-field.tsx"]}
      >
        <Grid cols={4}>
          <Specimen frame={fields.field} note="标签在值上方" />
          <Specimen frame={fields["field-error"]} note="行内错误" />
          <Specimen frame={fields.input} note="纯输入框" />
          <Specimen frame={fields["input-error"]} note="纯输入框，错误态" />
        </Grid>
        <Grid cols={3}>
          <Specimen frame={search.default} label="search / default" note="前置图标，仅占位文字" />
          <Specimen frame={copyField.default} label="copy-field / default" note="遮罩密钥 + 复制操作" wide />
        </Grid>
      </Section>

      <Section
        title="选择"
        description="所有单选形态都由 SingleChoice 一个组件渲染：少量并列项用 pills，切换视图用 tabs，空间不够用下拉，带标识的长列表用导航，需要一句话解释的决定用选项卡片。"
        sources={["components/single-choice.tsx", "components/switch.tsx"]}
      >
        <div class="grid grid-cols-[1fr_400px] items-start gap-6">
          <div class="grid grid-cols-2 gap-x-6 gap-y-8">
            <Specimen frame={switches.on} label="switch / on" note="accent 轨道，白色滑块" />
            <Specimen frame={switches.off} label="switch / off" />
            <Specimen frame={choices.pills} label="single-choice / pills" note="二到四个并列项" />
            <Specimen frame={choices.tabs} label="single-choice / tabs" note="切换视图" />
            <Specimen frame={choices.dropdown} label="single-choice / dropdown" note="空间不够时" />
            <Specimen frame={choices["option-card"]} label="single-choice / option-card" note="需要一句话解释的决定" />
          </div>
          <Specimen frame={choices.navigation} label="single-choice / navigation" note="带标识的长列表" />
        </div>
      </Section>

      <Section
        title="标签与状态"
        description="标签只标注事实，从不当按钮用。状态标签把色调和图标配对，去掉颜色也能看懂。紧凑状态和流程状态共用下面这组色调。"
        sources={["components/tag.tsx"]}
      >
        <Grid cols={5}>
          {["claim", "resource", "tag-meta", "tag-fact", "tag-ownership", "tag-danger", "disclosure", "status-ready", "status-missing", "status-unknown"].map((name) => (
            <Specimen frame={tags[name]} />
          ))}
        </Grid>
        <Matrix
          columns={["中性", "成功", "警告", "危险", "命令"]}
          rows={[
            { label: "紧凑状态", note: "列表行与胶囊", cells: tones.map((tone) => <Tag form="compact-status" tone={tone} icon="circle-dot">{tone ?? "idle"}</Tag>) },
            { label: "流程状态", note: "任务与看板状态", cells: tones.map((tone) => <Tag form="workflow-status" tone={tone} icon="circle-dot">{tone ?? "idle"}</Tag>) },
          ]}
        />
      </Section>

      <Section title="提示气泡" description="深色、小巧、短暂。提示气泡只给纯图标控件起名字，从不承载操作。" sources={["components/tooltip.tsx"]}>
        <Grid cols={4}>
          <Specimen frame={tooltip.default} label="tooltip / default" />
        </Grid>
      </Section>
    </Board>
  </Frame>
);
