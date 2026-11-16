import { Frame } from "adg";
import { Board, Section, Group, Grid, Specimen, framesOf } from "./kit/board";
import panelSource from "../components/panel";
import cardSource from "../components/card";
import tileSource from "../components/tile";
import settingsSource from "../components/settings-row";
import recordSource from "../components/record-detail";
import inventorySource from "../components/entity-inventory";
import popoverSource from "../components/inspection-popover";
import pathSource from "../components/project-path";
import noticeSource from "../components/notice";
import quotaSource from "../components/quota";
import updateSource from "../components/update-about";

const panels = framesOf(panelSource);
const cards = framesOf(cardSource);
const tiles = framesOf(tileSource);
const settings = framesOf(settingsSource);
const records = framesOf(recordSource);
const inventory = framesOf(inventorySource);
const popover = framesOf(popoverSource);
const paths = framesOf(pathSource);
const notices = framesOf(noticeSource);
const quota = framesOf(quotaSource);
const update = framesOf(updateSource);

export default () => (
  <Frame name="board" width={1680}>
    <Board
      chapter="03"
      eyebrow="ARC · Components"
      title="Containers and display"
      intro="Where content lives: panels and dialogs frame a task, cards group a record, rows carry a setting, and notices interrupt only when something failed. Every specimen is a declared frame imported from its source."
    >
      <Section
        title="Panels and dialogs"
        description="A panel is the 24px-radius sheet that holds one surface; a dialog is the same sheet with a footer that owns dismissal. While work is running the dialog cannot be discarded, and the footer says so."
        sources={["components/panel.tsx"]}
      >
        <Grid cols={2}>
          <Specimen frame={panels.panel} note="Title, actions, content" />
          <Specimen frame={panels.dialog} note="Panel with dialog chrome" />
        </Grid>
        <Group title="Dismissal" note="Footer states for dialogs that edit something">
          <Grid cols={2}>
            <Specimen frame={panels["dialog-discard"]} />
            <Specimen frame={panels["dialog-running"]} />
          </Grid>
        </Group>
        <Group title="Parts">
          <Grid cols={2}>
            <Specimen frame={panels["panel-header"]} note="Header alone, 512px" />
            <Specimen frame={panels["panel-shell"]} note="Shell without a header" />
          </Grid>
        </Group>
      </Section>

      <Section
        title="Cards and tiles"
        description="Cards group one record on a surface. A reply card nests under its parent. Tiles are the small square entry points used for phases and quick actions."
        sources={["components/card.tsx", "components/tile.tsx"]}
      >
        <Grid cols={2}>
          <Specimen frame={cards.card} />
          <Specimen frame={cards["card-reply"]} />
          <Specimen frame={cards["card-header"]} />
          <Specimen frame={cards["card-content"]} />
        </Grid>
        <Grid cols={5}>
          <Specimen frame={tiles.card} label="tile / card" />
          <Specimen frame={tiles.phase} label="tile / phase" />
        </Grid>
      </Section>

      <Section
        title="Rows and records"
        description="Settings rows put the explanation on the left and the control on the right edge, so a column of rows reads as a list of decisions. Records and inventories are read-only facts."
        sources={["components/settings-row.tsx", "components/record-detail.tsx", "components/entity-inventory.tsx", "components/inspection-popover.tsx", "components/project-path.tsx"]}
      >
        <Grid cols={2}>
          <Specimen frame={settings.setting} label="settings-row / setting" />
          <Specimen frame={records.detail} label="record-detail / detail" />
          <Specimen frame={inventory.content} label="entity-inventory / content" />
          <Specimen frame={popover.surface} label="inspection-popover / surface" />
        </Grid>
        <Grid cols={3}>
          <Specimen frame={paths.project} label="project-path / project" />
          <Specimen frame={paths["file-relative"]} label="project-path / file-relative" />
          <Specimen frame={paths["file-full"]} label="project-path / file-full" />
        </Grid>
      </Section>

      <Section
        title="Feedback and quota"
        description="A notice is the one loud container: it names what failed, shows the diagnostic and offers the single next step. Quota cards turn a usage window into a bar, a reset time and a tone."
        sources={["components/notice.tsx", "components/quota.tsx", "components/update-about.tsx"]}
      >
        <Grid cols={2}>
          <Specimen frame={notices.danger} label="notice / danger" />
          <Specimen frame={update["update-about-content"]} label="update-about / content" />
        </Grid>
        <Grid cols={3}>
          <Specimen frame={quota["quota-card-healthy"]} />
          <Specimen frame={quota["quota-card-warning"]} />
          <Specimen frame={quota["quota-card-exhausted"]} />
        </Grid>
      </Section>
    </Board>
  </Frame>
);
