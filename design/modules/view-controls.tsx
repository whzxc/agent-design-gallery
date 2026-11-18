import { Frame, Icon } from 'adg';
import { Button } from '../components/button';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { Separator, Toolbar } from '../components/toolbar';
import { Tooltip } from '../components/tooltip';
import viewControlFixtures from '../fixtures/view-controls.json';

export function ViewerTools({
  detailsOpen = false,
  inspectorDisabled = false,
  menu,
  commentsOpen = false,
  commentCount = 0,
  pinsHidden = false,
  hideInspector = false,
}: any) {
  return (
    <Toolbar>
      <button
        type="button"
        aria-label={`Comments, ${commentCount} open`}
        aria-expanded={commentsOpen}
        data-pins-hidden={pinsHidden ? 'true' : undefined}
        class={`flex h-(--control-size) shrink-0 items-center justify-center gap-1 rounded-row
          ${commentCount ? 'px-[6px]' : 'w-(--control-size)'}
          ${commentsOpen ? 'bg-surface-sunken text-text' : 'text-text-secondary'}`}
      >
        <Icon name="messages-square" />
        {commentCount > 0 && (
          <span
            class={`inline-grid min-h-4 min-w-4 place-items-center rounded-pill bg-surface-sunken px-1
              text-caption leading-none font-[650] text-text-secondary tabular-nums
              ${pinsHidden ? 'opacity-[0.65]' : ''}`}
          >
            {commentCount}
          </span>
        )}
      </button>
      <div class="relative">
        <IconButton icon="ellipsis" form={menu ? 'active' : 'default'} label="More" expanded={!!menu} />
        {menu && <div class="absolute top-full right-0 mt-[14px]">{menu}</div>}
      </div>
      {!hideInspector && (
        <IconButton
          icon="panel-right"
          form={detailsOpen ? 'active' : 'default'}
          label="Inspector"
          expanded={detailsOpen}
          disabled={inspectorDisabled}
        />
      )}
    </Toolbar>
  );
}

export function ViewerBars({
  project,
  scopes,
  isolation,
  tokenView,
  search,
  contentsOpen = false,
  hideContents = false,
  ...tools
}: any) {
  const tokenBoard = tokenView === 'board' || tokenView === 'Board view';
  const tokenLabel = tokenBoard
    ? 'Board view'
    : typeof tokenView === 'string' && tokenView !== 'list'
      ? tokenView
      : 'List view';

  return (
    <header class="flex items-start justify-between gap-3">
      <Toolbar wide>
        {!hideContents && (
          <IconButton
            icon="panel-left"
            form={contentsOpen ? 'active' : 'default'}
            label="Contents"
            expanded={contentsOpen}
          />
        )}
        {project}
        {(scopes || isolation || tokenView) && <Separator />}
        {scopes}
        {isolation && (
          <button
            type="button"
            aria-label={`Exit isolated scope: ${isolation}`}
            class="inline-flex h-(--control-size) shrink-0 items-center gap-[6px] rounded-row bg-surface-sunken
              px-[10px] text-body font-[550] text-text"
          >
            <Icon name="square-dashed" size={12} class="text-text-secondary" />
            <span class="truncate">{isolation}</span>
            <Icon name="x" size={12} class="text-text-secondary" />
          </button>
        )}
        {tokenView && (
          <button
            type="button"
            class="inline-flex h-(--control-size) shrink-0 items-center gap-[6px] rounded-row bg-surface-sunken
              px-[10px] text-body font-[550] text-text"
          >
            <Icon name={tokenBoard ? 'layout-grid' : 'list'} size={14} class="text-text-secondary" />
            <span>{tokenLabel}</span>
          </button>
        )}
        {!hideContents && search && (
          <>
            <Separator />
            {search}
          </>
        )}
      </Toolbar>
      <ViewerTools {...tools} />
    </header>
  );
}

export function ZoomBar({
  label = '48%',
  active = false,
  backDisabled = false,
  minimapPressed = false,
  commentPressed = false,
  commentDisabled = false,
  commentsOnly = false,
}: any) {
  const commentButton = (
    <IconButton
      icon="message-square-plus"
      label="Comment"
      form={commentPressed ? 'accent' : 'default'}
      pressed={commentPressed}
      disabled={commentDisabled}
    />
  );

  if (commentsOnly) return <Toolbar>{commentButton}</Toolbar>;

  return (
    <Toolbar>
      <IconButton icon="arrow-left" label="Back" disabled={backDisabled} />
      <div class="ml-1">
        <Separator />
      </div>
      <IconButton icon="minus" label="Zoom out" />
      <Button form={active ? 'zoom-open' : 'zoom'} label={label} />
      <IconButton icon="plus" label="Zoom in" />
      <div class="ml-1">
        <Separator />
      </div>
      <IconButton icon="scan" label="Fit" />
      <IconButton icon="map" label="Minimap" form={minimapPressed ? 'pressed' : 'default'} pressed={minimapPressed} />
      {commentButton}
    </Toolbar>
  );
}

const { isolatedBar, zoomBarStates } = viewControlFixtures;

export default () => [
  <Frame name="viewer-tools">
    <ViewerTools inspectorDisabled />
  </Frame>,
  <Frame name="viewer-tools-comments">
    <ViewerTools commentsOpen commentCount={2} inspectorDisabled />
  </Frame>,
  <Frame name="viewer-tools-tooltip">
    <div class="flex flex-col items-end gap-3 bg-canvas px-4 py-3">
      <ViewerTools />
      <Tooltip label="Inspector" />
    </div>
  </Frame>,
  <Frame name="viewer-bars-isolated">
    <div class="bg-canvas p-3">
      <ViewerBars
        project={<Field form="picker" label={isolatedBar.project} icon="folder" width={220} />}
        scopes={
          <div role="tablist" aria-label="Design scope" class="flex items-center gap-[2px]">
            {isolatedBar.scopes.map(scope => (
              <button
                type="button"
                role="tab"
                aria-selected="false"
                class="h-(--control-size) rounded-row px-3 text-body leading-4 font-[550]
                  whitespace-nowrap text-text-secondary"
              >
                {scope}
              </button>
            ))}
          </div>
        }
        isolation={isolatedBar.isolation}
        search={<Field form="search" label={isolatedBar.search} width={216} />}
        detailsOpen
      />
    </div>
  </Frame>,
  ...zoomBarStates.map(({ name, ...props }) => (
    <Frame name={name}>
      <ZoomBar {...props} />
    </Frame>
  )),
];
