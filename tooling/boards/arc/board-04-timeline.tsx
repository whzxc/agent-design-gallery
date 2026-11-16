import { Frame } from "adg";
import { Board, Section, Group, Grid, Specimen, Note, framesOf } from "./kit/board";
import timelineSource from "../modules/timeline";
import taskDetailSource from "../surfaces/task-detail";

const t = framesOf(timelineSource, "modules/timeline.tsx");
const detail = framesOf(taskDetailSource, "surfaces/task-detail.tsx");
const step = (name: string) => t[`timeline-step-${name}`];

export default () => (
  <Frame name="board" width={1680}>
    <Board
      chapter="04"
      eyebrow="ARC · 模块"
      title="任务时间线"
      intro="时间线让人不读完整记录也能跟上 Agent 的一轮工作：一条按类型排列的步骤轨道，实时工作在底部，之前的轮次折叠起来，每个要问用户的问题都提成一条请求。"
    >
      <Section
        title="实际场景"
        description="Agent 工作中的一个中继任务。轨道填满详情面板，本轮运行期间计划栏固定在下方。这是 task-detail 界面，由本板其余部分拼成。"
        sources={["surfaces/task-detail.tsx"]}
      >
        <Specimen frame={detail["relay-running"]} label="task-detail / relay-running" />
      </Section>

      <Section
        title="阅读一轮"
        description="所有步骤共用一条轨道和同一左边缘，眼睛按图标扫类型、只读要紧的。完成的轮次折成一行；失败的折叠会自己展开，错误永远不被藏起来。"
        sources={["modules/timeline.tsx"]}
      >
        <Grid cols={2}>
          <Specimen frame={t["timeline-rail"]} note="五个步骤的实时轨道" />
          <div class="flex flex-col gap-8">
            <Specimen frame={t["timeline-earlier-turn"]} note="之前的轮次在上方折叠" />
            <Specimen frame={t["timeline-fold"]} note="折叠的步骤" />
            <Specimen frame={t["timeline-fold-failed"]} note="失败时折叠保持展开" />
          </div>
        </Grid>
      </Section>

      <Section
        title="步骤类型"
        description="每种类型都有图标和来自基础板的阶段色：思考是紫色，文字是靛蓝，命令是蓝色，文件是绿色。思考可展开；工具和编辑汇总改了什么。"
      >
        <Grid cols={2}>
          <Specimen frame={step("thought")} label="step / thought" />
          <Specimen frame={step("thought-expanded")} label="step / thought-expanded" />
          <Specimen frame={step("say")} label="step / say" />
          <Specimen frame={step("tools")} label="step / tools" />
          <Specimen frame={step("edit")} label="step / edit" />
          <Specimen frame={step("failed")} label="step / failed" />
        </Grid>
      </Section>

      <Section
        title="实时工作"
        description="只有最新的步骤有动画。思考会脉动，流式文字原地增长，实时步骤带着已用时间，扫一眼就知道 Agent 还在不在动。"
      >
        <Grid cols={2}>
          <Specimen frame={step("thinking")} label="step / thinking" />
          <Specimen frame={step("say-streaming")} label="step / say-streaming" />
          <Specimen frame={step("live")} label="step / live" />
        </Grid>
        <Note>本板以减弱动效渲染，脉动和流式效果显示为静止状态。</Note>
      </Section>

      <Section
        title="询问用户"
        description="Agent 需要用户做决定时，步骤变成带操作的请求。回答后在原处记录答案；ARC 观察不到的答案会如实说明，不去猜。"
      >
        <Grid cols={2}>
          <Specimen frame={step("request")} label="step / request" />
          <Specimen frame={step("answered")} label="step / answered" />
          <Specimen frame={step("answered-unknown")} label="step / answered-unknown" />
        </Grid>
      </Section>

      <Section
        title="中继"
        description="中继任务会显示每条消息是谁发的、怎么传过来的。派发、排队和本地消息只有路由行不同；经中继返回的回复、请求和失败沿用同一条轨道。"
      >
        <Group title="消息">
          <Grid cols={2}>
            <Specimen frame={t["relay-route"]} />
            <Specimen frame={t["relay-message-dispatch"]} />
            <Specimen frame={t["relay-message-queued"]} />
            <Specimen frame={t["relay-message-local"]} />
          </Grid>
        </Group>
        <Group title="返回">
          <Grid cols={2}>
            <Specimen frame={t["relay-reply"]} />
            <Specimen frame={t["relay-request"]} />
            <Specimen frame={t["relay-failure"]} />
          </Grid>
        </Group>
      </Section>

      <Section
        title="计划栏"
        description="一轮运行期间，Agent 的计划停靠在轨道下方。收起时一行显示进度；展开时列出各步骤及其状态。"
      >
        <Grid cols={2}>
          <Specimen frame={t["timeline-plan-dock"]} />
          <Specimen frame={t["timeline-plan-dock-expanded"]} />
        </Grid>
      </Section>
    </Board>
  </Frame>
);
