/** 位置の寄せ方。-1 = 削除範囲の手前に寄せる、1 = 後ろに寄せる。 */
export type Assoc = -1 | 1;

/**
 * 1 ステップ分の位置の写像。ranges は [開始位置, 変更前の長さ, 変更後の長さ] の 3 つ組。
 * 雛形のステップはどれも 1 範囲しか変えないので、実質 1 組しか入らない。
 */
export class StepMap {
  static readonly empty = new StepMap([]);

  constructor(readonly ranges: readonly number[]) {}

  map(pos: number, assoc: Assoc = 1): number {
    let diff = 0;
    for (let i = 0; i < this.ranges.length; i += 3) {
      const start = this.ranges[i];
      if (start > pos) break;
      const oldSize = this.ranges[i + 1];
      const newSize = this.ranges[i + 2];
      const end = start + oldSize;
      if (pos <= end) {
        const side = oldSize === 0 ? assoc : pos === start ? -1 : pos === end ? 1 : assoc;
        return start + diff + (side < 0 ? 0 : newSize);
      }
      diff += newSize - oldSize;
    }
    return pos + diff;
  }
}

/** ステップの列に対応する写像の列 */
export class Mapping {
  constructor(readonly maps: StepMap[] = []) {}

  appendMap(map: StepMap): void {
    this.maps.push(map);
  }

  map(pos: number, assoc: Assoc = 1): number {
    let result = pos;
    for (const map of this.maps) result = map.map(result, assoc);
    return result;
  }

  /** from 番目の写像から先だけを適用する */
  mapFrom(pos: number, from: number, assoc: Assoc = 1): number {
    let result = pos;
    for (let i = from; i < this.maps.length; i++) result = this.maps[i].map(result, assoc);
    return result;
  }

  get length(): number {
    return this.maps.length;
  }
}
