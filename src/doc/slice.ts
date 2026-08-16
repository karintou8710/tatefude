import { ValidationError } from "./error";
import { type Leaf, type Node, Plot } from "./node";
import { Pos } from "./pos";

/**
 * ドキュメントの一部を「トークンの並び」として表したもの。
 *
 * ツリーを線形化する道具で、Wordgard の {@link Slice} と同じ考え方。
 * plot の開きと閉じもトークンなので、**ブロックの分割や結合が
 * 「トークンの挿入・削除」として表せる**。閉じトークンに識別子は無く、
 * そのとき開いている plot を閉じるだけ。
 */

/**
 * plot を閉じるトークン。
 * シンボルにしてあるのは、構造的な型ではノードと区別が付かなくなるため。
 */
export const Close = Symbol("ecw.close");

export type CloseToken = typeof Close;

/** ノード (まるごと) か、plot の開き (タグ) か、閉じ */
export type Token = Node | Plot.Tag | CloseToken;

export function isOpen(token: Token): token is Plot.Tag {
  return token instanceof Plot.Tag;
}

export function isClose(token: Token): token is CloseToken {
  return token === Close;
}

export function tokenLength(token: Token): number {
  if (isClose(token) || isOpen(token)) return 1;
  return token.length;
}

export function tokenToString(token: Token): string {
  if (isClose(token)) return "[close]";
  if (isOpen(token)) return `[open ${token.name}]`;
  return token.toString();
}

export class Slice {
  static readonly empty = new Slice([]);

  readonly length: number;

  private constructor(readonly tokens: readonly Token[]) {
    this.length = tokens.reduce((sum, token) => sum + tokenLength(token), 0);
  }

  static of(tokens: readonly Token[]): Slice {
    return tokens.length ? new Slice(tokens) : Slice.empty;
  }

  get empty(): boolean {
    return this.tokens.length === 0;
  }

  append(other: Slice): Slice {
    if (this.empty) return other;
    if (other.empty) return this;
    return Slice.of([...this.tokens, ...other.tokens]);
  }

  /** トークン境界で切る。テキストだけは途中でも切れる。 */
  slice(from: number, to: number = this.length): Slice {
    if (from <= 0 && to >= this.length) return this;
    const out: Token[] = [];
    let pos = 0;
    for (const token of this.tokens) {
      const length = tokenLength(token);
      const start = pos;
      const end = pos + length;
      if (end > from && start < to) {
        if (start >= from && end <= to) {
          out.push(token);
        } else if (isTextToken(token)) {
          out.push(token.sliceText(Math.max(0, from - start), Math.min(length, to - start)));
        } else {
          // 開き / 閉じ / atom は割れないので、掛かっていれば丸ごと入れる
          out.push(token);
        }
      }
      pos = end;
    }
    return Slice.of(out);
  }

  eq(other: Slice): boolean {
    if (this.tokens.length !== other.tokens.length) return false;
    return this.tokens.every((token, i) => {
      const mine = token;
      const theirs = other.tokens[i];
      if (isClose(mine) || isClose(theirs)) return mine === theirs;
      if (isOpen(mine) || isOpen(theirs)) return isOpen(mine) && isOpen(theirs) && mine.eq(theirs);
      return mine.eq(theirs as Node);
    });
  }

  toString(): string {
    return this.tokens.map(tokenToString).join(" ");
  }
}

function isTextToken(token: Token): token is Leaf<string> {
  return !isClose(token) && !isOpen(token) && token.isLeaf && token.isText;
}

/** doc の [from, to) をトークンの並びとして取り出す */
export function sliceDoc(doc: Plot, from: number, to: number): Slice {
  const out: Token[] = [];
  collect(doc, 0, from, to, out);
  return Slice.of(out);
}

function collect(parent: Plot, contentStart: number, from: number, to: number, out: Token[]): void {
  let pos = contentStart;
  for (const child of parent.content) {
    const childFrom = pos;
    const childTo = pos + child.length;
    pos = childTo;
    if (childTo <= from || childFrom >= to) continue;
    if (childFrom >= from && childTo <= to) {
      out.push(child);
      continue;
    }
    if (child.isPlot) {
      if (childFrom >= from) out.push(child.tag);
      collect(child, childFrom + 1, from, to, out);
      if (childTo <= to) out.push(Close);
    } else if (child.isText) {
      out.push(
        child.sliceText(Math.max(0, from - childFrom), Math.min(child.length, to - childFrom)),
      );
    } else {
      out.push(child);
    }
  }
}

/** トークンの並びから plot を組み立てる。釣り合いが取れていなければ例外。 */
export function buildPlot(tag: Plot.Tag, tokens: readonly Token[]): Plot {
  const stack: { tag: Plot.Tag; content: Node[] }[] = [{ tag, content: [] }];
  for (const token of tokens) {
    const top = stack[stack.length - 1];
    if (isClose(token)) {
      if (stack.length === 1) throw new ValidationError("閉じトークンが余っている");
      stack.pop();
      stack[stack.length - 1].content.push(top.tag.create(top.content));
    } else if (isOpen(token)) {
      stack.push({ tag: token, content: [] });
    } else {
      top.content.push(token);
    }
  }
  if (stack.length !== 1) throw new ValidationError("開きトークンが閉じていない");
  return tag.create(stack[0].content);
}

/** その位置で開いている plot のタグ (doc を含む、外側から順に) */
export function stackAt(doc: Plot, pos: number): Plot.Tag[] {
  const $pos = Pos.resolve(doc, pos);
  const stack: Plot.Tag[] = [];
  for (let depth = 0; depth <= $pos.depth; depth++) stack.push($pos.node(depth).tag);
  return stack;
}
