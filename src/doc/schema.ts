import { SchemaError, ValidationError } from "./error";
import { Mark } from "./mark";
// Node は型の別名であると同時に、Group / Role を持つ名前空間でもある
import { Leaf, Node, Plot } from "./node";

/**
 * スキーマは「どのノードとマークが使えるか」と「どこに置けるか」を決める。
 *
 * 中身の指定は Wordgard 流の {@link Node.Query} (型そのもの・グループ・和・積) で、
 * ProseMirror のようなコンテンツ式の文字列は持たない。
 * {@link Schema.validate} がドキュメントを再帰的に検査し、検査済みのノードは
 * WeakSet に覚えるので、変わっていない部分は 2 度見ない。
 */
export class Schema {
  private readonly nodesByName = new Map<string, Node.Type>();
  private readonly marksByName = new Map<string, Mark.Type>();
  private readonly validated = new WeakSet<object>();

  private constructor(
    readonly elements: readonly Schema.Element[],
    readonly nodes: readonly Node.Type[],
    readonly marks: readonly Mark.Type[],
    private readonly plotContent: Map<Plot.Type, Node.Query | true>,
    private readonly markTarget: Map<Mark.Type, Node.Query>,
    private readonly nodeGroups: Map<Node.Type, Set<Node.Group>>,
    readonly docTag: Plot.Tag,
    readonly defaultBlock: Plot.Tag,
  ) {
    for (const type of nodes) this.nodesByName.set(type.name, type);
    for (const type of marks) this.marksByName.set(type.name, type);
  }

  static define(elements: readonly Schema.Element[]): Schema {
    const nodes: Node.Type[] = [];
    const marks: Mark.Type[] = [];
    const plotContent = new Map<Plot.Type, Node.Query | true>();
    const markTarget = new Map<Mark.Type, Node.Query>();
    const nodeGroups = new Map<Node.Type, Set<Node.Group>>();
    let docType: Plot.Type | null = null;
    let defaultBlock: Plot.Tag | null = null;

    const all = elements.some((elt) => typeFor(elt) === Leaf.Text)
      ? elements
      : [Leaf.Text as Schema.Element, ...elements];

    for (const element of all) {
      const type = typeFor(element);
      if (type) {
        if (nodes.includes(type)) continue;
        if (nodes.some((other) => other.name === type.name)) {
          throw new SchemaError(`ノード名 ${type.name} が重複している`);
        }
        nodes.push(type);
        nodeGroups.set(type, groupsFor(type));
        if (type instanceof Plot.Type) {
          const spec = type.spec;
          plotContent.set(
            type,
            type.inlineContent ? (spec.inlineContent ?? true) : (spec.blockContent as Node.Query),
          );
          if (type.isDoc) {
            if (docType) throw new SchemaError("ドキュメント型が 2 つある");
            docType = type;
          }
          if (spec.defaultBlock && type.default) defaultBlock = type.default;
        }
        continue;
      }
      const markType = markFor(element);
      if (!markType) throw new SchemaError("スキーマに渡せない要素が混ざっている");
      if (marks.includes(markType)) continue;
      if (marks.some((other) => other.name === markType.name)) {
        throw new SchemaError(`マーク名 ${markType.name} が重複している`);
      }
      marks.push(markType);
      markTarget.set(markType, markType.target ?? Node.Group.Inline);
    }

    if (!docType) throw new SchemaError("スキーマにはドキュメント型が要る");
    if (!docType.default) throw new SchemaError("ドキュメント型にはパラメータを持たせられない");
    if (!defaultBlock) {
      const textblock = nodes.find(
        (type): type is Plot.Type => type instanceof Plot.Type && type.isTextblock,
      );
      if (!textblock?.default)
        throw new SchemaError("既定のブロックになれるテキストブロックがない");
      defaultBlock = textblock.default;
    }

    return new Schema(
      elements,
      nodes,
      marks,
      plotContent,
      markTarget,
      nodeGroups,
      docType.default,
      defaultBlock,
    );
  }

  /** このスキーマのドキュメントを作る。作るときに必ず検査する。 */
  doc(content: readonly Node[]): Plot {
    const doc = this.docTag.create(content);
    this.validate(doc);
    return doc;
  }

  nodeType(name: string): Node.Type {
    const type = this.nodesByName.get(name);
    if (!type) throw new RangeError(`Unknown node type: ${name}`);
    return type;
  }

  markType(name: string): Mark.Type {
    const type = this.marksByName.get(name);
    if (!type) throw new RangeError(`Unknown mark type: ${name}`);
    return type;
  }

  has(element: Schema.Element): boolean {
    const type = typeFor(element);
    if (type) return this.nodesByName.get(type.name) === type;
    const mark = markFor(element);
    return !!mark && this.marksByName.get(mark.name) === mark;
  }

  /** ノード型が指定に当てはまるか */
  matchNode(type: Node.Type, query: Node.Query): boolean {
    if (query instanceof Node.Group) {
      return this.nodeGroups.get(type)?.has(query) ?? false;
    }
    const queryType = typeFor(query as Schema.Element);
    if (queryType) return queryType === type;
    if (Array.isArray(query)) {
      return (query as readonly Node.Query[]).some((q) => this.matchNode(type, q));
    }
    return (query as { and: readonly Node.Query[] }).and.every((q) => this.matchNode(type, q));
  }

  /** parent の中身に child を置けるか */
  canContain(parent: Plot.Type, child: Node.Type): boolean {
    const content = this.plotContent.get(parent);
    if (content === undefined) return false;
    if (parent.inlineContent !== child.isInline) return false;
    return content === true ? true : this.matchNode(child, content);
  }

  /** そのノードにマークを付けられるか */
  markAllowed(mark: Mark.Type, node: Node.Type): boolean {
    const target = this.markTarget.get(mark);
    return target ? this.matchNode(node, target) : false;
  }

  /** ノードとその中身がスキーマに合っているか調べる */
  validate(node: Node): void {
    if (this.validated.has(node)) return;
    if (node.isLeaf) {
      this.validateTag(node);
    } else {
      this.validateTag(node.tag);
      if (!node.type.canBeEmpty && !node.content.length) {
        throw new ValidationError(`${node.name} の中身は空にできない`);
      }
      for (const child of node.content) {
        if (!this.canContain(node.type, child.type)) {
          throw new ValidationError(`${node.name} は ${child.name} を含められない`);
        }
        this.validate(child);
      }
    }
    this.validated.add(node);
  }

  private validateTag(tag: Node.Tag): void {
    if (this.nodesByName.get(tag.name) !== tag.type) {
      throw new ValidationError(`ノード型 ${tag.name} がスキーマにない`);
    }
    tag.type.spec.validate?.(tag.param as never);
    for (const mark of tag.marks) {
      if (this.marksByName.get(mark.name) !== mark.type) {
        throw new ValidationError(`マーク型 ${mark.name} がスキーマにない`);
      }
      if (!this.markAllowed(mark.type, tag.type)) {
        throw new ValidationError(`マーク ${mark.name} は ${tag.name} に付けられない`);
      }
      mark.type.spec.validate?.(mark.value as never);
    }
  }

  nodeFromJSON(json: Node.JSON): Node {
    const marks = json.marks
      ? Object.entries(json.marks).map(([name, value]) => this.markType(name).of(value))
      : Mark.none;
    const type = this.nodeType(json.type);
    if (type === Leaf.Text) return Leaf.text(json.param as string, marks);
    if (type instanceof Plot.Type) {
      const content = json.content?.map((child) => this.nodeFromJSON(child)) ?? [];
      return type.of(json.param ?? null, marks).create(content);
    }
    return (type as Leaf.Type).of(json.param ?? null, marks);
  }

  docFromJSON(json: Node.JSON): Plot {
    const doc = this.nodeFromJSON(json);
    if (!doc.isPlot) throw new ValidationError("ドキュメントが plot ではない");
    this.validate(doc);
    return doc;
  }
}

export namespace Schema {
  /** スキーマに渡せるもの。タグ・型・マークを 1 つの配列に混ぜて書く。 */
  export type Element = Node.Tag | Node.Type | Mark | Mark.Type;
}

function typeFor(element: unknown): Node.Type | null {
  if (element instanceof Leaf.Type || element instanceof Plot.Type) return element;
  if (element instanceof Leaf) return element.type;
  if (element instanceof Plot.Tag) return element.type;
  return null;
}

function markFor(element: unknown): Mark.Type | null {
  if (element instanceof Mark.Type) return element;
  if (element instanceof Mark) return element.type;
  return null;
}

/** 組み込みのグループ + spec の group を、親グループまで展開して集める */
function groupsFor(type: Node.Type): Set<Node.Group> {
  const groups = new Set<Node.Group>();
  const add = (group: Node.Group | undefined) => {
    for (let g = group; g; g = g.parent) groups.add(g);
  };
  add(Node.Group.All);
  add(type.isInline ? Node.Group.Inline : Node.Group.Block);
  add(type.isLeaf ? Node.Group.Leaf : Node.Group.Plot);
  if (type instanceof Plot.Type && type.isTextblock) add(Node.Group.Textblock);
  const spec = type.spec.group;
  if (spec) for (const group of Array.isArray(spec) ? spec : [spec as Node.Group]) add(group);
  return groups;
}
