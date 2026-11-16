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

const panels = framesOf(panelSource, "components/panel.tsx");
const cards = framesOf(cardSource, "components/card.tsx");
const tiles = framesOf(tileSource, "components/tile.tsx");
const settings = framesOf(settingsSource, "components/settings-row.tsx");
const records = framesOf(recordSource, "components/record-detail.tsx");
const inventory = framesOf(inventorySource, "components/entity-inventory.tsx");
const popover = framesOf(popoverSource, "components/inspection-popover.tsx");
const paths = framesOf(pathSource, "components/project-path.tsx");
const notices = framesOf(noticeSource, "components/notice.tsx");
const quota = framesOf(quotaSource, "components/quota.tsx");
const update = framesOf(updateSource, "components/update-about.tsx");

export default () => (
  <Frame name="board" width={1680}>
    <Board
      chapter="03"
      eyebrow="ARC · 组件"
      title="容器与展示"
      intro="内容放在哪里：面板和对话框框住一项任务，卡片归拢一条记录，列表行承载一项设置，通知只在出错时打断。每个样本都是从源文件导入的已声明 frame；容器按桌面视口展示。"
    >
      <Section
        title="面板与对话框"
        description="面板是承载一个界面的 24px 圆角底板；对话框是同一块底板加上负责关闭的页脚。工作运行期间对话框不能丢弃，页脚会明确说明。"
        sources={["components/panel.tsx"]}
      >
        <Grid cols={2}>
          <Specimen frame={panels.panel} note="标题、操作、内容 · 960px 桌面宽度" wide stage="desktop" />
          <Specimen frame={panels.dialog} note="带对话框外壳的面板 · 560px" wide stage="desktop" />
        </Grid>
        <Group title="关闭" note="编辑类对话框的页脚状态">
          <Grid cols={2}>
            <Specimen frame={panels["dialog-discard"]} wide stage="desktop" />
            <Specimen frame={panels["dialog-running"]} wide stage="desktop" />
          </Grid>
        </Group>
        <Group title="部件">
          <Grid cols={2}>
            <Specimen frame={panels["panel-header"]} note="单独的页头，512px" />
            <Specimen frame={panels["panel-shell"]} note="无页头的外壳" />
          </Grid>
        </Group>
      </Section>

      <Section
        title="卡片与磁贴"
        description="卡片在界面上归拢一条记录，回复卡片嵌套在父卡片下。磁贴是用于阶段和快捷操作的小方块入口。"
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
        title="列表行与记录"
        description="设置行左边放说明、右边缘放控件，一列行读起来就是一串决定。记录和清单是只读的事实。"
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
        title="反馈与配额"
        description="通知是唯一“大声”的容器：说清哪里失败、给出诊断、只提供一个下一步。配额卡片把用量窗口换算成进度条、重置时间和色调。"
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
