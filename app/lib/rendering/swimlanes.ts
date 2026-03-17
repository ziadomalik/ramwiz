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
  // Maps each flat lane index to a Y pixel center for:
  // (channel -> bus -> rank -> bankgroup -> bank).
  //
  // RowLayout entries are ordered parent-first from the depth-first DOM walk
  // in trace.vue. Each entry carries channel/bus/rank/bankgroup/bank
  // identifiers. More specific rows naturally overwrite less specific ones:
  //   1. A channel row sets all children under that channel.
  //   2. A bus row overwrites all children under that bus.
  //   3. A rank row overwrites all children under that rank.
  //   4. A bankgroup row overwrites all banks under that bankgroup.
  //   5. A bank row overwrites that specific bank.
  private buildSwimlaneLookup(): void {
    if (!this.canvas) return;
    const canvasRect = this.canvas.getBoundingClientRect();

    const memoryLayout = useSessionStore().memoryLayout;
    if (!memoryLayout) return;

    const { numRanks, numBankgroups, numBanks } = memoryLayout;
    const rowLayout = useUIStore().rowLayout;
    const numBuses = 2;
    const ranksPerBus = numRanks * numBankgroups * numBanks;
    const banksPerRank = numBankgroups * numBanks;
    const firstBusYOffsetByChannel = new Map<number, number>();

    // Measure actual channel->first-bus vertical delta from rendered rows.
    // This avoids hardcoded assumptions about row height/border spacing.
    for (let i = 0; i < rowLayout.length; i++) {
      const row = rowLayout[i]!;
      if (row.channel === undefined || row.bus !== undefined) continue;

      const channelCenter = row.top + row.height / 2;
      for (let j = i + 1; j < rowLayout.length; j++) {
        const candidate = rowLayout[j]!;
        if (candidate.channel !== row.channel) break;
        if (candidate.bus === undefined) continue;

        const busCenter = candidate.top + candidate.height / 2;
        firstBusYOffsetByChannel.set(row.channel, busCenter - channelCenter);
        break;
      }
    }

    for (const row of rowLayout) {
      if (row.channel === undefined) continue;
      let yCenter = (row.top + row.height / 2) - canvasRect.top;

      // Channel rows are container headers. If a channel is collapsed, map its
      // events to the first child lane position to keep merged events inside
      // the drawable timeline area (below top rulers).
      if (row.bus === undefined) {
        yCenter += firstBusYOffsetByChannel.get(row.channel) ?? row.height;
      }

      // Determine the hierarchy ranges this row covers.
      // Omitted dimensions imply "all children".
      const busStart = row.bus ?? 0;
      const busEnd = row.bus ?? (numBuses - 1);
      const rankStart = row.rank ?? 0;
      const rankEnd = row.rank ?? (numRanks - 1);
      const bgStart = row.bankgroup ?? 0;
      const bgEnd = row.bankgroup ?? (numBankgroups - 1);
      const bStart = row.bank ?? 0;
      const bEnd = row.bank ?? (numBanks - 1);

      for (let bus = busStart; bus <= busEnd; bus++) {
        for (let rank = rankStart; rank <= rankEnd; rank++) {
          for (let bg = bgStart; bg <= bgEnd; bg++) {
            for (let b = bStart; b <= bEnd; b++) {
              const flatIdx =
                row.channel * (numBuses * ranksPerBus) +
                bus * ranksPerBus +
                rank * banksPerRank +
                bg * numBanks +
                b;
              this.swimlaneCache.data![flatIdx * 4] = yCenter;
            }
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

    const totalLanes = Math.max(
      memoryLayout.numChannels * 2 * memoryLayout.numRanks * memoryLayout.numBankgroups * memoryLayout.numBanks,
      1
    );

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