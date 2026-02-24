import createREGL from 'regl';

export class SwimlanesRenderer {
  yIndexTexture: createREGL.Texture;

  swimlaneCache = {
    layoutVersion: -1,
    canvasTop: NaN,
    totalLanes: 0,
    data: null as Float32Array | null,
  };

  constructor(private readonly regl: createREGL.Regl, private readonly canvas: HTMLCanvasElement | null) {
    this.yIndexTexture = this.regl.texture({ width: 1, height: 1 });
  }

  // Writes swimlane lookup data into the Float32Array cache.
  // Maps each flat lane index (ch * maxBg * maxBank + bg * maxBank + bank) to a Y pixel center.
  //
  // RowLayout entries are ordered parent-first (channel → bankgroup → bank) from the
  // depth-first DOM walk in trace.vue. Each entry carries its channel/bankgroup/bank
  // identifiers. More specific rows naturally overwrite less specific ones:
  //   1. A channel row sets ALL banks under that channel to the channel's Y.
  //   2. A bankgroup row overwrites all banks under that bankgroup.
  //   3. A bank row overwrites that specific bank.
  private buildSwimlaneLookup(): void {
    if (!this.canvas) return;
    const canvasRect = this.canvas.getBoundingClientRect();

    const memoryLayout = useSessionStore().memoryLayout;
    if (!memoryLayout) return;

    const { numBankgroups, numBanks } = memoryLayout;
    const rowLayout = useUIStore().rowLayout;

    for (const row of rowLayout) {
      if (row.channel === undefined) continue;
      const yCenter = (row.top + row.height / 2) - canvasRect.top;

      // Determine the range of bankgroups and banks this row covers.
      // A channel-level row (bankgroup undefined) covers all bankgroups and banks.
      // A bankgroup-level row (bank undefined) covers all banks within that bankgroup.
      // A bank-level row covers exactly one flat index.
      const bgStart = row.bankgroup ?? 0;
      const bgEnd = row.bankgroup ?? (numBankgroups - 1);
      const bStart = row.bank ?? 0;
      const bEnd = row.bank ?? (numBanks - 1);

      for (let bg = bgStart; bg <= bgEnd; bg++) {
        for (let b = bStart; b <= bEnd; b++) {
          const flatIdx = row.channel * (numBankgroups * numBanks) + bg * numBanks + b;
          this.swimlaneCache.data![flatIdx * 4] = yCenter;
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

      this.buildSwimlaneLookup();

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