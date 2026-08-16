import { SchemaError } from "./error";
import { compareDeep, eqArray, none } from "./helper";
import { Mark } from "./mark";
import { NodeShape, type Shape } from "./shape";

/**
 * 中身を持てる {@link Plot} と、持たない {@link Leaf} の 2 種類。テキストは値が文字列の Leaf。
 * 長さは Plot が「開き + 中身 + 閉じ」で `contentLength + 2`、Leaf は 1 (テキストは文字数)。
 */
export type Node = Plot | Leaf;

const FLAG = {
  None: 0,
  Inline: 1,
  InlineContent: 2,
  Atom: 4,
  Doc: 8,
  NullParam: 16,
  CanBeEmpty: 32,
} as const;

abstract class BaseType<Param> {
  readonly roles: ReadonlySet<Node.Role>;

  constructor(
    readonly name: string,
    readonly flags: number,
    // Param のままだとクラスが invariant になり、Leaf.Type<string> を
    // Node.Type<unknown> として扱えなくなるので、spec の型引数は消してある
    // biome-ignore lint/suspicious/noExplicitAny: 型の分散をそろえるため
    spec: Node.Spec<any>,
    readonly shape: NodeShape<Param>,
  ) {
    const roles = new Set<Node.Role>();
    if (spec.role) {
      for (const role of Array.isArray(spec.role) ? spec.role : [spec.role as Node.Role]) {
        roles.add(role);
      }
    }
    this.roles = roles;
  }

  hasRole(role: Node.Role): boolean {
    return this.roles.has(role);
  }

  get isInline(): boolean {
    return (this.flags & FLAG.Inline) > 0;
  }
  get isBlock(): boolean {
    return (this.flags & FLAG.Inline) === 0;
  }
  get isAtom(): boolean {
    return (this.flags & FLAG.Atom) > 0 || this.shape.atom;
  }

  abstract get isLeaf(): boolean;
  abstract get isPlot(): boolean;
}

abstract class BaseTag<Param> {
  abstract readonly type: Node.Type<Param>;

  constructor(
    readonly param: Param,
    readonly marks: Mark.Set,
  ) {}

  get name(): string {
    return this.type.name;
  }

  /** このタグに付いているマークの値を引く */
  mark<Value>(type: Mark.Type<Value>): Value | undefined {
    return type.isInSet(this.marks)?.value;
  }

  get isText(): boolean {
    return this.type === (Leaf.Text as Node.Type<unknown>);
  }

  is<T>(type: Node.Type<T>): boolean {
    return (this.type as Node.Type<unknown>) === (type as Node.Type<unknown>);
  }

  toJSON(): Node.JSON {
    const json: Node.JSON = { type: this.name };
    if (this.param !== null && this.param !== undefined) json.param = this.param;
    if (this.marks.length) {
      json.marks = {};
      for (const mark of this.marks) json.marks[mark.name] = mark.value;
    }
    return json;
  }
}

class LeafType<Param = unknown> extends BaseType<Param> {
  /** パラメータを持たない型では、この 1 つを使い回す */
  readonly default: Leaf<Param> | null;
  // biome-ignore lint/suspicious/noExplicitAny: BaseType と同じ理由
  readonly spec: Leaf.Spec<any>;

  constructor(name: string, flags: number, spec: Leaf.Spec<Param>) {
    super(name, flags, spec, NodeShape.from(true, spec.shape));
    this.spec = spec;
    this.default =
      "defaultParam" in spec
        ? Leaf.create(this, spec.defaultParam as Param, none)
        : flags & FLAG.NullParam
          ? Leaf.create(this, null as Param, none)
          : null;
  }

  static define<Param>(name: string, spec: Leaf.Spec<Param>): LeafType<Param> {
    return new LeafType(name, flagsFor(spec), spec);
  }

  of(param: Param, marks: Mark.Set = Mark.none): Leaf<Param> {
    if (!marks.length && this.default && compareDeep(this.default.param, param))
      return this.default;
    return Leaf.create(this, param, marks);
  }

  get isLeaf(): true {
    return true;
  }
  get isPlot(): false {
    return false;
  }
}

/** テキスト・画像・改行など。タグそのものでもある */
export class Leaf<Param = unknown> extends BaseTag<Param> {
  static readonly Type = LeafType;

  /** テキストの型。param が文字列そのもの。 */
  static readonly Text: LeafType<string> = new LeafType<string>("Text", FLAG.Inline, {
    shape: { element: "" },
  });

  private constructor(
    override readonly type: LeafType<Param>,
    param: Param,
    marks: Mark.Set,
  ) {
    super(param, marks);
  }

  /** @internal */
  static create<Param>(type: LeafType<Param>, param: Param, marks: Mark.Set): Leaf<Param> {
    return new Leaf(type, param, marks);
  }

  get tag(): Leaf<Param> {
    return this;
  }

  get length(): number {
    return this.isText ? (this.param as string).length : 1;
  }

  get text(): string {
    if (!this.isText) throw new Error("text を持たない Leaf");
    return this.param as string;
  }

  get isLeaf(): true {
    return true;
  }
  get isPlot(): false {
    return false;
  }
  get isInline(): boolean {
    return this.type.isInline;
  }
  get isBlock(): boolean {
    return this.type.isBlock;
  }
  get textContent(): string {
    return this.isText ? (this.param as string) : "";
  }

  eq(other: Node): boolean {
    return (
      this === other ||
      (other.isLeaf &&
        this.type === (other.type as LeafType<unknown>) &&
        compareDeep(this.param, other.param) &&
        Mark.sameSet(this.marks, other.marks))
    );
  }

  withMarks(marks: Mark.Set): Leaf<Param> {
    return Mark.sameSet(this.marks, marks) ? this : this.type.of(this.param, marks);
  }

  /** テキスト Leaf を切り出す */
  sliceText(from: number, to?: number): Leaf<string> {
    if (!this.isText) throw new Error("sliceText をテキスト以外に呼んだ");
    const text = this.param as string;
    const end = to ?? text.length;
    if (from === 0 && end === text.length) return this as unknown as Leaf<string>;
    return Leaf.Text.of(text.slice(Math.max(from, 0), Math.max(0, end)), this.marks);
  }

  /** 値を持たない Leaf 型を 1 つ定義する */
  static define(name: string, spec: Leaf.Spec<null>): Leaf<null> {
    const type = new LeafType<null>(name, flagsFor(spec) | FLAG.NullParam, spec);
    if (!type.default) throw new SchemaError(`Leaf ${name} has no default`);
    return type.default;
  }

  static text(text: string, marks: Mark.Set = Mark.none): Leaf<string> {
    return Leaf.Text.of(text, marks);
  }

  toString(): string {
    return this.isText ? JSON.stringify(this.param) : this.name;
  }
}

export namespace Leaf {
  export type Type<Param = unknown> = LeafType<Param>;

  export interface Spec<Param> extends Node.Spec<Param> {
    /** textContent に出す文字 (画像の代替文字など) */
    toText?: (leaf: Leaf<Param>) => string;
  }
}

class PlotTag<Param = unknown> extends BaseTag<Param> {
  constructor(
    override readonly type: PlotType<Param>,
    param: Param,
    marks: Mark.Set,
  ) {
    super(param, marks);
  }

  eq(other: Node | Node.Tag): boolean {
    return (
      this === other ||
      (other instanceof PlotTag &&
        this.type === (other.type as PlotType<unknown>) &&
        compareDeep(this.param, other.param) &&
        Mark.sameSet(this.marks, other.marks))
    );
  }

  /** このタグで plot を作る */
  create(content: readonly Node[] = none): Plot {
    return Plot.create(this, joinText(content));
  }

  withMarks(marks: Mark.Set): PlotTag<Param> {
    return Mark.sameSet(this.marks, marks) ? this : this.type.of(this.param, marks);
  }

  /** ブロックを分割したときに、後ろ側が引き継ぐタグ */
  split(): PlotTag<Param> {
    if (!this.marks.length) return this;
    return this.withMarks(this.marks.filter((mark) => mark.type.keepOnSplit));
  }

  get inlineContent(): boolean {
    return this.type.inlineContent;
  }
  get isTextblock(): boolean {
    return this.type.isTextblock;
  }
  get isLeaf(): false {
    return false;
  }
  get isPlot(): true {
    return true;
  }
  get isDoc(): boolean {
    return this.type.isDoc;
  }

  toString(): string {
    return this.name;
  }
}

class PlotType<Param = unknown> extends BaseType<Param> {
  readonly default: PlotTag<Param> | null;
  // biome-ignore lint/suspicious/noExplicitAny: BaseType と同じ理由
  readonly spec: Plot.Spec<any>;

  constructor(name: string, flags: number, spec: Plot.Spec<Param>) {
    super(name, flags, spec, NodeShape.from(false, spec.shape));
    this.spec = spec;
    if (!spec.inlineContent && !spec.blockContent) {
      throw new SchemaError(`Plot ${name} は inlineContent か blockContent のどちらかが要る`);
    }
    this.default =
      "defaultParam" in spec
        ? new PlotTag(this, spec.defaultParam as Param, none)
        : flags & FLAG.NullParam
          ? new PlotTag(this, null as Param, none)
          : null;
  }

  static define<Param>(name: string, spec: Plot.Spec<Param>): PlotType<Param> {
    return new PlotType(name, flagsFor(spec), spec);
  }

  of(param: Param, marks: Mark.Set = Mark.none): PlotTag<Param> {
    if (!marks.length && this.default && compareDeep(this.default.param, param))
      return this.default;
    return new PlotTag(this, param, marks);
  }

  get inlineContent(): boolean {
    return (this.flags & FLAG.InlineContent) > 0;
  }
  get isTextblock(): boolean {
    return this.isBlock && this.inlineContent;
  }
  get isDoc(): boolean {
    return (this.flags & FLAG.Doc) > 0;
  }
  get canBeEmpty(): boolean {
    return (this.flags & FLAG.CanBeEmpty) > 0;
  }
  get isLeaf(): false {
    return false;
  }
  get isPlot(): true {
    return true;
  }
}

/** タグ (型 + パラメータ + マーク) と中身の並びでできている */
export class Plot {
  static readonly Tag = PlotTag;
  static readonly Type = PlotType;

  readonly contentLength: number;

  protected constructor(
    // biome-ignore lint/suspicious/noExplicitAny: PlotTag<Param> をそのまま持てるようにするため
    readonly tag: PlotTag<any>,
    readonly content: readonly Node[],
  ) {
    this.contentLength = contentLength(content);
  }

  /** @internal */
  // biome-ignore lint/suspicious/noExplicitAny: 上の tag と同じ理由
  static create(tag: PlotTag<any>, content: readonly Node[]): Plot {
    return new Plot(tag, content);
  }

  get name(): string {
    return this.tag.name;
  }
  get type(): PlotType<unknown> {
    return this.tag.type;
  }
  get marks(): Mark.Set {
    return this.tag.marks;
  }
  get param(): unknown {
    return this.tag.param;
  }

  get length(): number {
    return this.contentLength + 2;
  }

  get isLeaf(): false {
    return false;
  }
  get isPlot(): true {
    return true;
  }
  get isText(): false {
    return false;
  }
  get isInline(): boolean {
    return this.type.isInline;
  }
  get isBlock(): boolean {
    return this.type.isBlock;
  }
  get inlineContent(): boolean {
    return this.type.inlineContent;
  }
  get isTextblock(): boolean {
    return this.type.isTextblock;
  }

  get childCount(): number {
    return this.content.length;
  }
  child(index: number): Node {
    const found = this.content[index];
    if (!found) throw new RangeError(`Index ${index} out of range`);
    return found;
  }
  maybeChild(index: number): Node | null {
    return this.content[index] ?? null;
  }
  get firstChild(): Node | null {
    return this.content[0] ?? null;
  }
  get lastChild(): Node | null {
    return this.content[this.content.length - 1] ?? null;
  }

  get textContent(): string {
    return this.content.map((child) => child.textContent).join("");
  }

  mark<Value>(type: Mark.Type<Value>): Value | undefined {
    return this.tag.mark(type);
  }

  eq(other: Node): boolean {
    return (
      this === other ||
      (other.isPlot && this.tag.eq(other.tag) && eqArray(this.content, other.content))
    );
  }

  withContent(content: readonly Node[]): Plot {
    if (content === this.content) return this;
    return Plot.create(this.tag, joinText(content));
  }

  withMarks(marks: Mark.Set): Plot {
    return Mark.sameSet(this.marks, marks)
      ? this
      : Plot.create(this.tag.withMarks(marks), this.content);
  }

  replaceChildren(index: number, count: number, nodes: readonly Node[]): Plot {
    const next = this.content.slice();
    next.splice(index, count, ...nodes);
    return this.withContent(next);
  }

  nodeAt(pos: number): Node | null {
    let node: Plot = this;
    let rest = pos;
    for (;;) {
      const { index, offset } = findIndex(node.content, rest);
      const child = node.maybeChild(index);
      if (!child) return null;
      if (offset === rest || child.isLeaf) return child;
      rest -= offset + 1;
      node = child;
    }
  }

  toJSON(): Node.JSON {
    const json = this.tag.toJSON();
    if (this.content.length) json.content = this.content.map((child) => child.toJSON());
    return json;
  }

  toString(): string {
    return `${this.name}(${this.content.map((child) => child.toString()).join(", ")})`;
  }

  /** パラメータを持たない plot 型を 1 つ定義する */
  static define(name: string, spec: Plot.Spec<null>): PlotTag<null> {
    const type = new PlotType<null>(name, flagsFor(spec) | FLAG.NullParam, spec);
    if (!type.default) throw new SchemaError(`Plot ${name} has no default tag`);
    return type.default;
  }
}

export namespace Plot {
  export type Tag<Param = unknown> = PlotTag<Param>;
  export type Type<Param = unknown> = PlotType<Param>;

  export interface Spec<Param> extends Node.Spec<Param> {
    /** ブロックを中身に持つときの、許す種類 */
    blockContent?: Node.Query;
    /** インラインを中身に持つときの、許す種類。true なら何でも */
    inlineContent?: Node.Query | true;
    /** ドキュメントのトップ */
    doc?: boolean;
    /** 中身が空でもよいか (テキストブロックは既定で空を許す) */
    canBeEmpty?: boolean;
    /** 段落の代わりに作られる既定のブロックか */
    defaultBlock?: boolean;
  }
}

export namespace Node {
  export type Type<Param = unknown> = LeafType<Param> | PlotType<Param>;

  /** タグ = 型 + パラメータ + マーク。Leaf は自分自身がタグ、Plot はタグを持つ。 */
  export type Tag = Leaf | PlotTag;

  export interface Spec<Param> {
    inline?: boolean;
    defaultParam?: Param;
    group?: Group | readonly Group[];
    role?: Role | readonly Role[];
    shape: Shape.Node<Param>;
    validate?: (param: Param) => void;
  }

  export interface JSON {
    type: string;
    param?: unknown;
    marks?: Record<string, unknown>;
    content?: readonly JSON[];
  }

  /** 親を持てるので、Content に入るものは自動的に All にも入る */
  export class Group {
    private constructor(readonly parent: Group | undefined) {}

    static define(parent?: Group): Group {
      return new Group(parent);
    }

    static readonly All = Group.define();
    static readonly Inline = Group.define(Group.All);
    static readonly Block = Group.define(Group.All);
    static readonly Leaf = Group.define(Group.All);
    static readonly Plot = Group.define(Group.All);
    static readonly Textblock = Group.define(Group.Block);
    /** 段落やリストのような、一般的なブロックの置き場 */
    static readonly Content = Group.define(Group.Block);
  }

  /** 単体・グループ・配列 (和)・`{and: [...]}` (積) */
  export type Query = Node.Tag | Node.Type | Group | readonly Query[] | { and: readonly Query[] };

  /** コマンドが型を特定するのに使う */
  export class Role {
    private constructor() {}
    static define(): Role {
      return new Role();
    }
    static readonly Code = Role.define();
    static readonly List = Role.define();
    static readonly LineBreak = Role.define();
  }
}

// biome-ignore lint/suspicious/noExplicitAny: 型の分散をそろえるため
function flagsFor(spec: Node.Spec<any>): number {
  let flags = FLAG.None;
  if (spec.inline) flags |= FLAG.Inline;
  const plot = spec as Plot.Spec<unknown>;
  if (plot.inlineContent) flags |= FLAG.InlineContent;
  if (plot.doc) flags |= FLAG.Doc;
  // テキストブロックは空でもよい (空段落を作れないと編集にならない)
  if (plot.canBeEmpty ?? !!plot.inlineContent) flags |= FLAG.CanBeEmpty;
  return flags;
}

/* 中身 (ノードの並び) を扱うための道具 */

export function contentLength(content: readonly Node[]): number {
  return content.reduce((sum, node) => sum + node.length, 0);
}

/** 隣り合う同じマークのテキストをつなぎ、空テキストを落とす */
export function joinText(content: readonly Node[]): readonly Node[] {
  const result: Node[] = [];
  for (const node of content) {
    if (node.isLeaf && node.isText && node.text === "") continue;
    const last = result[result.length - 1];
    if (
      last?.isLeaf &&
      last.isText &&
      node.isLeaf &&
      node.isText &&
      Mark.sameSet(last.marks, node.marks)
    ) {
      result[result.length - 1] = Leaf.text(last.text + node.text, node.marks);
    } else {
      result.push(node);
    }
  }
  return result.length ? result : none;
}

/** 境界にあるときは後ろ側の index を返す */
export function findIndex(
  content: readonly Node[],
  pos: number,
): { index: number; offset: number } {
  const size = contentLength(content);
  if (pos === 0) return { index: 0, offset: 0 };
  if (pos === size) return { index: content.length, offset: pos };
  if (pos > size || pos < 0) throw new RangeError(`Position ${pos} out of range`);
  let curPos = 0;
  for (let i = 0; ; i++) {
    const cur = content[i];
    const end = curPos + cur.length;
    if (end >= pos)
      return end === pos ? { index: i + 1, offset: end } : { index: i, offset: curPos };
    curPos = end;
  }
}

export function cutContent(content: readonly Node[], from: number, to?: number): readonly Node[] {
  const size = contentLength(content);
  const end = to ?? size;
  if (from === 0 && end === size) return content;
  const result: Node[] = [];
  let pos = 0;
  for (let i = 0; pos < end && i < content.length; i++) {
    const child = content[i];
    const childEnd = pos + child.length;
    if (childEnd > from) {
      if (pos < from || childEnd > end) {
        if (child.isLeaf && child.isText) {
          result.push(child.sliceText(Math.max(0, from - pos), Math.min(child.length, end - pos)));
        } else if (child.isPlot) {
          result.push(
            child.withContent(
              cutContent(
                child.content,
                Math.max(0, from - pos - 1),
                Math.min(child.contentLength, end - pos - 1),
              ),
            ),
          );
        } else {
          result.push(child);
        }
      } else {
        result.push(child);
      }
    }
    pos = childEnd;
  }
  return result.length ? result : none;
}

export function appendContent(a: readonly Node[], b: readonly Node[]): readonly Node[] {
  if (!a.length) return b;
  if (!b.length) return a;
  return joinText([...a, ...b]);
}
