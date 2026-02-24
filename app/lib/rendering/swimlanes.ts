import createREGL from 'regl';

export class SwimlanesRenderer {
  yIndexTexture: createREGL.Texture;

  // Swimlane texture cache to only rebuild when layout/expanded state changes.
  private cachedDefaultExpanded: string[] | null = null;
  private cachedDefaultExpandedCount = -1;
  private swimlaneCache = {
    layoutVersion: -1,
    canvasTop: NaN,
    totalLanes: 0,
    data: null as Float32Array | null,
  };

  constructor(private readonly regl: createREGL.Regl, private readonly canvas: HTMLCanvasElement | null) {
    this.yIndexTexture = this.regl.texture({ width: 1, height: 1 });
  }

  // Writes swimlane lookup data into the provided Float32Array buffer (must be pre-zeroed).
  // Maps each flat lane index (ch * maxBg * maxBank + bg * maxBank + bank) to a Y pixel center
  // based on the current tree expand/collapse state and row layout positions.
  private buildSwimlaneLookupInto(expandedState: string[]): void {

    if (!this.canvas) return;
    const canvasRect = this.canvas.getBoundingClientRect();

    const memoryLayout = useSessionStore().memoryLayout;
    if (!memoryLayout) return;

    const { numChannels, numBankgroups, numBanks } = memoryLayout;

    const rowLayout = useUIStore().rowLayout;
    const expandedSet = new Set(expandedState);

    // Walk the tree to understand the order of the rows in the DOM.
    let visualRow = 0;

    for (let ch = 0; ch < numChannels; ch++) {
      const channelRowIdx = visualRow;
      visualRow++;

      const channelExpanded = expandedSet.has(`ch${ch}`);

      for (let bg = 0; bg < numBankgroups; bg++) {
        // If channel is collapsed, bankgroup rows don't exist in the DOM
        let bgRowIdx = channelRowIdx;
        if (channelExpanded) {
          bgRowIdx = visualRow;
          visualRow++;
        }

        const bgExpanded = channelExpanded && expandedSet.has(`ch${ch}_bg${bg}`);

        for (let b = 0; b < numBanks; b++) {
          // If bankgroup is collapsed, bank rows don't exist in the DOM
          let bankRowIdx = bgRowIdx;
          if (bgExpanded) {
            bankRowIdx = visualRow;
            visualRow++;
          }

          const flatIdx = ch * (numBankgroups * numBanks) + bg * numBanks + b;
          const row = rowLayout[bankRowIdx];
          if (row) {
            this.swimlaneCache.data![flatIdx * 4] = (row.top + row.height / 2) - canvasRect.top;
          }
        }
      }
    }
  }

  update() {
    if (!this.canvas) return;
    const uiStore = useUIStore();
    const memoryLayout = useSessionStore().memoryLayout;

    if (!memoryLayout) return;

    const canvasRect = this.canvas.getBoundingClientRect();

    let expanded = uiStore.expandedState;

    if (expanded.length === 0) {
      if (!this.cachedDefaultExpanded || this.cachedDefaultExpandedCount !== memoryLayout.numChannels) {
        this.cachedDefaultExpandedCount = memoryLayout.numChannels;
        this.cachedDefaultExpanded = Array(memoryLayout.numChannels).fill('').map((_: any, i: number) => `ch${i}`);
      }
      expanded = this.cachedDefaultExpanded;
    }

    const totalLanes = Math.max(memoryLayout.numChannels * memoryLayout.numBankgroups * memoryLayout.numBanks, 1);

    const swimlaneDirty = (
      this.swimlaneCache.layoutVersion !== uiStore.layoutVersion ||
      this.swimlaneCache.canvasTop !== canvasRect.top ||
      this.swimlaneCache.totalLanes !== totalLanes
    );

    if (swimlaneDirty) {
      this.swimlaneCache.layoutVersion = uiStore.layoutVersion;
      this.swimlaneCache.canvasTop = canvasRect.top;
      this.swimlaneCache.totalLanes = totalLanes;

      if (!this.swimlaneCache.data || this.swimlaneCache.data.length < totalLanes * 4) {
        this.swimlaneCache.data = new Float32Array(Math.max(totalLanes, 1) * 4);
      } else {
        this.swimlaneCache.data.fill(0);
      }

      this.buildSwimlaneLookupInto(expanded);

      // @ts-expect-error - regl textures can be reinitialized by calling them as functions, but the TS types freak out for some reason.
      this.yIndexTexture({
        width: totalLanes,
        height: 1,
        data: this.swimlaneCache.data,
        format: 'rgba',
        type: 'float',
        min: 'nearest',
        mag: 'nearest',
      });
    }
  }
}