import { Frame } from "adg";
import { Board, Section, Group, Grid, Specimen, Note, framesOf } from "./kit/board";
import timelineSource from "../modules/timeline";
import taskDetailSource from "../surfaces/task-detail";

const t = framesOf(timelineSource);
const detail = framesOf(taskDetailSource);
const step = (name: string) => t[`timeline-step-${name}`];

export default () => (
  <Frame name="board" width={1680}>
    <Board
      chapter="04"
      eyebrow="ARC · Modules"
      title="Task timeline"
      intro="The timeline is how a person follows an agent's turn without reading a transcript: one rail of typed steps, live work at the bottom, earlier turns folded away, and every question to the user lifted out as a request."
    >
      <Section
        title="In context"
        description="A relayed task while the agent is working. The rail fills the detail panel; the plan dock stays pinned below it while the turn runs. This is the task-detail surface, composed from the parts on the rest of this board."
        sources={["surfaces/task-detail.tsx"]}
      >
        <Specimen frame={detail["relay-running"]} label="task-detail / relay-running" />
      </Section>

      <Section
        title="Reading a turn"
        description="Steps share one rail and one left edge, so the eye scans kinds by icon and only reads what matters. A finished turn folds to one line; a failed fold opens itself so the error is never hidden."
        sources={["modules/timeline.tsx"]}
      >
        <Grid cols={2}>
          <Specimen frame={t["timeline-rail"]} note="A live rail with five steps" />
          <div class="flex flex-col gap-8">
            <Specimen frame={t["timeline-earlier-turn"]} note="Previous turns collapse above" />
            <Specimen frame={t["timeline-fold"]} note="Folded steps" />
            <Specimen frame={t["timeline-fold-failed"]} note="A failure keeps its fold open" />
          </div>
        </Grid>
      </Section>

      <Section
        title="Step kinds"
        description="Each kind has an icon and a phase colour from the foundations: thinking is violet, text is indigo, commands are blue, files are green. Thoughts can expand; tools and edits summarise what changed."
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
        title="Live work"
        description="Only the newest step animates. Thinking pulses, streaming text grows in place and a live step carries the elapsed time, so a glance tells whether the agent is still moving."
      >
        <Grid cols={2}>
          <Specimen frame={step("thinking")} label="step / thinking" />
          <Specimen frame={step("say-streaming")} label="step / say-streaming" />
          <Specimen frame={step("live")} label="step / live" />
        </Grid>
        <Note>Renders on this board are captured with reduced motion, so pulses and streaming appear at rest.</Note>
      </Section>

      <Section
        title="Asking the user"
        description="When the agent needs a decision the step becomes a request with its own actions. Once answered it records the answer in place; an answer that ARC could not observe says so instead of guessing."
      >
        <Grid cols={2}>
          <Specimen frame={step("request")} label="step / request" />
          <Specimen frame={step("answered")} label="step / answered" />
          <Specimen frame={step("answered-unknown")} label="step / answered-unknown" />
        </Grid>
      </Section>

      <Section
        title="Relay"
        description="Relayed tasks show who sent each message and how it travelled. Dispatch, queued and local messages differ only in their route line; replies, requests and failures returned through the relay keep the same rail."
      >
        <Group title="Messages">
          <Grid cols={2}>
            <Specimen frame={t["relay-route"]} />
            <Specimen frame={t["relay-message-dispatch"]} />
            <Specimen frame={t["relay-message-queued"]} />
            <Specimen frame={t["relay-message-local"]} />
          </Grid>
        </Group>
        <Group title="Returns">
          <Grid cols={2}>
            <Specimen frame={t["relay-reply"]} />
            <Specimen frame={t["relay-request"]} />
            <Specimen frame={t["relay-failure"]} />
          </Grid>
        </Group>
      </Section>

      <Section
        title="Plan dock"
        description="The agent's plan sits below the rail while a turn runs. Collapsed it shows progress in one line; expanded it lists the steps with their state."
      >
        <Grid cols={2}>
          <Specimen frame={t["timeline-plan-dock"]} />
          <Specimen frame={t["timeline-plan-dock-expanded"]} />
        </Grid>
      </Section>
    </Board>
  </Frame>
);
