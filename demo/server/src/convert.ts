import {
  type Block,
  type Body,
  type Border,
  b,
  box,
  command,
  type DocumentStyle,
  em,
  type Flow,
  type Group,
  hbox,
  hexToRgb,
  type InlineOrExtender,
  kenten,
  newpage,
  p,
  page,
  pt,
  ruby,
  solid,
  text,
} from "@minitype/minitype";

/** `Node.toJSON()` が返す形。core を import せずに済むよう、こちらで持つ */
export interface NodeJson {
  type: string;
  param?: unknown;
  marks?: Record<string, unknown>;
  content?: readonly NodeJson[];
}

/** デモの PrintSpec に doc を足しただけ。紙の数字は向こうが全部持っている */
export interface PrintRequest {
  doc: NodeJson;
  /** 書式。ブロックの型だけでなく、紙の飾り (台本の帯) もこれで決まる */
  format: "novel" | "script";
  /** 1 行の字数と 1 ページの行数 */
  chars: number;
  lines: number;
  /** 字送りと行送り (pt) */
  charAdvance: number;
  lineAdvance: number;
  /** 判型と余白 (mm) */
  sheet: {
    width: number;
    height: number;
    margin: { top: number; bottom: number; side: number };
  };
}

/** 人物名の枠。CSS の --speaker と同じ 8 字 */
const SPEAKER = 8;
/** ノンブルの級数 (pt) */
const NOMBRE_SIZE = 7;
/** ト書きの字下げ。CSS の --action (人物名 + 2 字) と同じ */
const ACTION = SPEAKER + 2;
/** 台本の帯。行頭に空ける欄で、柱の番号だけがここに立つ。CSS の --band と同じ 3 字 */
const BAND = 3;
/** 帯の横罫と本文の間の空き (字)。CSS の --band-gap と同じ役 */
const BAND_GAP = 0.25;
/** 帯の横罫と柱の枠の太さ (mm) */
const HAIRLINE = 0.3;
const INK = "#111";

const bodyStyle = {
  align: "justify",
  // ぶら下げは行長を超える。字送りのグリッドを崩さないほうを取る
  burasagari: false,
  // 縦中横は**エンジンが数字を自動で拾う**ぶんだけ。3 桁以上は 1 字ぶんに収まらず
  // 隣の行に被るので、既定の 2 桁から上げない (Tcy の上限は 4 だが、そこは合わない)
  tatechuyoko: 2,
} as const;

export function buildDocument(req: PrintRequest): {
  groups: Group[];
  style: Partial<DocumentStyle>;
} {
  const size = { width: req.sheet.width, height: req.sheet.height };
  // minitype の長さは mm。字送り・行送りは pt で渡ってくる
  const fontSize = pt(req.charAdvance);
  const lineHeight = pt(req.lineAdvance);
  assertFits(req, fontSize, lineHeight);
  const margin = req.sheet.margin;
  const style: Partial<DocumentStyle> = {
    size,
    writingMode: "vertical",
    // 余白は spec の値をそのまま置く。engine の calculatePhysicalPadding は行の積み方向に
    // 半行ぶん少なく取るので、行数がひとつ足りなくなる
    padding: {
      type: "physical",
      top: margin.top,
      bottom: margin.bottom,
      left: margin.side,
      right: margin.side,
    },
    block: {
      paragraph: { ...bodyStyle, size: fontSize, lineHeight },
      h2: { ...bodyStyle, size: fontSize, lineHeight },
    },
    // シーンの間隔。**ちょうど 1 行**でないと 1 ページの行数が減り、画面の組みとずれる
    gaps: [
      ["fallback", "h2", lineHeight],
      ["fallback", "fallback", 0],
    ],
  };
  const body: Body = [nombre()];
  // 帯の罫は台本だけ。柱の番号はこの罫を底にして立つ
  if (req.format === "script") body.push(bandRule(req, fontSize, lineHeight));
  body.push(...blocks(req, fontSize, lineHeight));
  return { groups: [{ body }], style };
}

/**
 * ノンブル。版面の下端に置く。**本文は縦組みでも数字は横組み**なので、
 * フローだけ書字方向を変える (公式の novel テンプレートと同じ形)。
 */
function nombre(): Flow {
  const size = pt(NOMBRE_SIZE);
  return {
    type: "flow",
    position: "nombre",
    writingMode: "horizontal",
    // 版面から下へ。地の余白のなかで天地中央あたりに来る量 (既定の 0 は本文に近すぎる)
    blockOffset: 6,
    blocks: [
      p([[page]], {
        size,
        lineHeight: size * 1.5,
        align: "center",
        // 本文の段落スタイルを継いでしまうので、字下げは明示的に切る
        firstIndent: 0,
        effects: [{ type: "fill", color: hexToRgb("#8a8378") }],
      }),
    ],
  };
}

/**
 * 帯の横罫。行頭から BAND 字の位置に、行の積み方向へ 1 本渡す。
 * 本文と一緒に流すとブロックごとに切れるので、ノンブルと同じページの飾りとして置く。
 *
 * **エンジンは字面を行の頭に寄せ、行間はまるごと次の行との間に置く。**罫を版面のまま引くと、
 * 行送りいっぱいに広げた柱の枠が半行ぶんはみ出すので、帯のほうを字面に合わせて寄せる。
 */
function bandRule(req: PrintRequest, fontSize: number, lineHeight: number): Flow {
  return {
    type: "flow",
    position: "pillar",
    inlineOffset: (BAND - BAND_GAP) * fontSize,
    blockOffset: -(lineHeight - fontSize) / 2,
    blocks: [
      // 中身を持たない箱の天が罫そのもの。長さは版面の幅で決める
      box([], {
        blockSize: req.sheet.width - req.sheet.margin.side * 2,
        border: { type: "logical", inlineStart: hairline() },
      }),
    ],
  };
}

/** 帯の横罫と柱の枠で同じ 1 本を使う */
function hairline(): Border {
  return solid(HAIRLINE, hexToRgb(INK));
}

/** 数字を書き間違えたら、黙って組みが崩れるより落とす */
function assertFits(req: PrintRequest, fontSize: number, lineHeight: number): void {
  const { width, height, margin } = req.sheet;
  const room = {
    inline: height - margin.top - margin.bottom,
    block: width - margin.side * 2,
  };
  const need = { inline: req.chars * fontSize, block: req.lines * lineHeight };
  if (need.inline > room.inline || need.block > room.block) {
    throw new RangeError(
      `版面が紙に入らない: ${need.inline.toFixed(2)}×${need.block.toFixed(2)}mm > ` +
        `${room.inline.toFixed(2)}×${room.block.toFixed(2)}mm`,
    );
  }
}

/** 書式ごとにブロックの型が違う。知らない型は書式の取り違えなので、どちらも落とす */
function blocks(req: PrintRequest, fontSize: number, lineHeight: number): Block[] {
  return req.format === "script"
    ? scriptBlocks(req, fontSize, lineHeight)
    : novelBlocks(req.doc.content ?? []);
}

function novelBlocks(nodes: readonly NodeJson[]): Block[] {
  const out: Block[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "Paragraph":
        out.push(p(oneLine(inlines(node.content))));
        break;
      case "PageStart":
        // 改ページを型で持たせてあるので、そのまま newpage に写る
        out.push(newpage(), p(oneLine(inlines(node.content))));
        break;
      default:
        throw new Error(`未対応のブロック: ${node.type}`);
    }
  }
  return out;
}

/**
 * 台本。**字下げはどれも帯の下から測る**ので、行頭からの字数は BAND + それぞれの字下げ。
 * firstIndent は indent への足し算なので、1 行目を戻すときは負で打ち消す。
 */
function scriptBlocks(req: PrintRequest, fontSize: number, lineHeight: number): Block[] {
  const nodes = req.doc.content ?? [];
  const out: Block[] = [];
  let scene = 0;
  for (const node of nodes) {
    switch (node.type) {
      case "SceneHeading": {
        scene += 1;
        const line = sceneLine(scene, node.content, req.chars, fontSize, lineHeight);
        out.push({
          // 1 行目だけ行頭まで戻して番号の箱を置く。場所の名前は罫の下から
          ...text("h2", oneLine([line]), { indent: em(BAND), firstIndent: em(-BAND) }),
          // 番号は帯に自分で置くので、見出しの通し番号は要らない
          unnumbered: true,
        });
        break;
      }
      case "Action":
        out.push(p(oneLine(inlines(node.content)), { indent: em(BAND + ACTION) }));
        break;
      case "Dialogue":
        // 閉じ括弧は CSS の生成内容だったので、ここでは文字で足す。
        // 折り返しは人物名の枠の下にぶら下げる (CSS の padding + 負の text-indent と同じ)
        out.push(
          p(oneLine([...inlines(node.content), "」"]), {
            indent: em(BAND + SPEAKER),
            firstIndent: em(-SPEAKER),
          }),
        );
        break;
      default:
        throw new Error(`未対応のブロック: ${node.type}`);
    }
  }
  return out;
}

/**
 * 柱の 1 行。番号を帯に立て、行の左右に縦罫を**行の端まで**通す。底は引かない —
 * 帯の横罫が番号の箱の底になり、行末側は版面の縁で切れる (画面の柱と同じ)。
 */
function sceneLine(
  index: number,
  content: readonly NodeJson[] = [],
  chars: number,
  fontSize: number,
  lineHeight: number,
): InlineOrExtender {
  const leading = lineHeight - fontSize;
  // 場所の名前は行末まで場所を取る枠に入れる。**行の長さいっぱいまで取らないと罫が途中で止まる**。
  // 枠なので折り返しは無く、行より長い柱ははみ出す (診断に出る)
  const body = (chars - BAND) * fontSize;
  return command(
    [
      hbox(em(BAND - BAND_GAP), [String(index)], { align: "center" }),
      // 罫と本文の間の空き
      hbox(em(BAND_GAP), []),
      hbox(body, inlines(content), { align: "left" }),
    ],
    {
      style: {
        border: {
          type: "logical",
          inlineStart: hairline(),
          blockStart: hairline(),
          blockEnd: hairline(),
        },
        // **枠の幅は最後のインラインの大きさから広がる。**行末まで取った hbox がそれなので、
        // その幅を打ち消して 1 行に戻す。前の padding は枠を後ろへも押すので半行間だけ戻す
        padding: {
          type: "logical",
          blockStart: -leading / 2,
          blockEnd: lineHeight - body + leading / 2,
        },
      },
    },
  );
}

function inlines(nodes: readonly NodeJson[] = []): InlineOrExtender[] {
  const out: InlineOrExtender[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "Text":
        out.push(...withMarks(String(node.param ?? ""), node.marks));
        break;
      case "Ruby":
        out.push(ruby(plainText(childOf(node, "RubyBase")), plainText(childOf(node, "RubyText"))));
        break;
      case "Tcy":
        // **数字しか縦中横にならない。**任意の文字列を 1 字ぶんに組む口がエンジンに無く、
        // 「!?」のような約物は 1 字ずつ縦に積まれる (画面とずれる)
        out.push(plainText(node));
        break;
      case "Speaker":
        // 開き括弧も CSS の生成内容。**justify にすると名前の字まで散る**ので、
        // 名前は枠の頭に寄せ、括弧を枠の末尾に置いて発話の開始位置をそろえる
        out.push(hbox(em(SPEAKER - 1), inlines(node.content), { align: "left" }), "「");
        break;
      default:
        throw new Error(`未対応のインライン: ${node.type}`);
    }
  }
  return out;
}

/** rank の小さいマークが内側。view / serialize と同じ順で包む */
function withMarks(value: string, marks?: Record<string, unknown>): InlineOrExtender[] {
  if (!marks) return [value];
  let body: InlineOrExtender[] = [value];
  if ("Strong" in marks) body = [b(body)];
  // CSS の text-emphasis: filled sesame と同じゴマ点
  if ("Bouten" in marks) body = [kenten(body, "sesame")];
  return body;
}

/** 段落の中の改行は doc に無いので、常に 1 行として渡す */
function oneLine(content: InlineOrExtender[]): InlineOrExtender[][] {
  return [content.length ? content : [""]];
}

function childOf(node: NodeJson, type: string): NodeJson | undefined {
  return node.content?.find((child) => child.type === type);
}

function plainText(node: NodeJson | undefined): string {
  if (!node) return "";
  if (node.type === "Text") return String(node.param ?? "");
  return (node.content ?? []).map(plainText).join("");
}
