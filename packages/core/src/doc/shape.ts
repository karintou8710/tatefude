// Wordgard (MIT) から派生。著作権表示は LICENSE の "Third-party code" を参照。

/**
 * `Elt` の子に置いた `0` が中身の入る穴。属性名を `style/foo` にすると style プロパティに
 * なる (傍点のような、要素ではなくスタイルで表すマーク向け)。HTML → doc のパースは M1。
 */

export type Attributes = Readonly<Record<string, string>>;

const noChildren: readonly (string | Elt | 0)[] = [];

export class Elt {
  static readonly hole: readonly (string | Elt | 0)[] = [0];

  private constructor(
    readonly tagName: string,
    readonly attrs: Attributes,
    readonly children: readonly (string | Elt | 0)[],
  ) {}

  static mk(name: string, children?: readonly (string | Elt | 0)[]): Elt;
  static mk(name: string, attrs: Attributes, children?: readonly (string | Elt | 0)[]): Elt;
  static mk(
    name: string,
    arg1?: Attributes | readonly (string | Elt | 0)[],
    arg2?: readonly (string | Elt | 0)[],
  ): Elt {
    const [attrs, children] = arg2
      ? [arg1 as Attributes, arg2]
      : !arg1
        ? [{}, noChildren]
        : Array.isArray(arg1)
          ? [{}, arg1 as readonly (string | Elt | 0)[]]
          : [arg1 as Attributes, noChildren];
    return new Elt(name, attrs, children);
  }

  /** 中身の穴を持つか */
  get hasContent(): boolean {
    return this.children.some((child) => child === 0 || (child instanceof Elt && child.hasContent));
  }
}

export namespace Shape {
  /** 単純に 1 要素で描くノード */
  export interface Element<Param> {
    element: string;
    attrs?: Attributes | ((param: Param) => Attributes);
    /** 中身を持たない扱いにする */
    atom?: boolean;
  }

  /** パラメータによって形が変わるノード (見出しのレベルなど) */
  export interface Structure<Param> {
    structure: (param: Param) => Elt;
    atom?: boolean;
  }

  export type Node<Param> = Element<Param> | Structure<Param>;

  /** 要素で包むマーク (`<strong>` など) */
  export interface MarkElement<Value> {
    element: string;
    attrs?: Attributes | ((value: Value) => Attributes);
  }

  /**
   * 属性 / スタイルで表すマーク。`value` に `0` を渡すとマークの値をそのまま使う。
   * 例: `{ attribute: "style/text-emphasis", value: "filled sesame" }`
   */
  export interface MarkAttribute {
    attribute: string;
    value: string | 0;
  }

  export type Mark<Value> = MarkElement<Value> | MarkAttribute;
}

/** ノード型が持つ描画情報 */
export class NodeShape<Param> {
  private constructor(
    readonly atom: boolean,
    // 保持する関数の型に Param を出さない。出すとクラスが invariant になり、
    // Leaf<string> を Node として扱えなくなる。
    // biome-ignore lint/suspicious/noExplicitAny: 型の分散をそろえるため
    private readonly build: (param: any) => Elt,
  ) {}

  render(param: Param): Elt {
    return this.build(param);
  }

  static from<Param>(isLeaf: boolean, spec: Shape.Node<Param>): NodeShape<Param> {
    if ("structure" in spec) {
      return new NodeShape(spec.atom ?? isLeaf, spec.structure);
    }
    const atom = spec.atom ?? isLeaf;
    return new NodeShape(atom, (param: Param) => {
      const attrs = typeof spec.attrs === "function" ? spec.attrs(param) : (spec.attrs ?? {});
      return atom ? Elt.mk(spec.element, attrs) : Elt.mk(spec.element, attrs, Elt.hole);
    });
  }
}
