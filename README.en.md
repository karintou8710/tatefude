# tatefude

[日本語](README.md)

A rich-text editing library for building **a WYSIWYG editor for vertical Japanese text, with ruby (furigana), emphasis dots (bōten) and tate-chu-yoko**.  
It is built on the EditContext API instead of contenteditable.

- Demo: <https://karintou8710.github.io/tatefude/>

Chromium 121+ only.  
Safari and Firefox have no EditContext implementation.

## Design

**EditContext was chosen for ruby.**  
With contenteditable, there is no choice but to leave the DOM to the browser while the IME is composing.  
Ruby is a special layout, so this is where bugs are easy to hit.  
With EditContext the browser does not rewrite the DOM, so **the whole job of watching with a MutationObserver and putting back what it broke disappears**.

Thanks to that, the view is only a render function `(doc, selection, decorations) → DOM`.  
In exchange an EditContext is attached per block, so operations that cross blocks (selection, deletion, arrow movement) and the vertical layout are written by hand.

## Use

```ts
const state = EditorState.create({
  config: [basicSchema(), history()],
  doc: (schema) => schema.doc([...]),
});

// Hand it a host element and it draws there and starts taking input
const view = new EditorView(document.getElementById("editor")!, { state });
view.focus();

// A command only returns how the state should change; run applies it and takes focus back
const splitBlock: Command = (state) => ({
  changes: { from, to, insert: [Close, tag], fit: true },
  selection: (doc, changes) => Selection.near(doc, changes.mapPos(to, 1)),
  userEvent: "input.split",
});
view.run(splitBlock);
```

For React, `tatefude-react` owns rebuilding the view and the subscription.

```tsx
const editor = useEditor({ config: [basicSchema(), history()], doc }, [id]);
// The selector decides what is read, so unrelated keystrokes do not re-render
const canUndo = useEditorState(editor, (state) => undoDepth(state) > 0);

<EditorContent editor={editor} />;
```

Selection is painted with CSS Custom Highlight rather than the native one.  
The default is the system selection color, so write this only if you want to change it.

```css
::highlight(tf-selection) { background-color: #b4d5fe; color: inherit; }

/* Marks that the caret is inside an inline block (the rb / rt of a ruby) */
::highlight(tf-inline-active) { background-color: #ffe9a8; }
```

## Development

```bash
pnpm install
pnpm dev          # demo at http://localhost:5180
pnpm test         # model (node)
pnpm test:browser # view / EditContext (real Chromium)
pnpm typecheck
pnpm build
pnpm lint
```

The browser tests need `pnpm exec playwright install chromium` once.

A pnpm workspace.  
What ships is `packages/core` (`tatefude`, no dependencies, plain DOM) and `packages/react` (`tatefude-react`); `demo/` is **a consumer that imports them by name**.

## Not there yet

- Copy & paste, node views, tables, lists, collaborative editing
- Shift-click range extension, touch / pen selection
- A fallback for Safari and Firefox, mobile

## Acknowledgements

`packages/core/src/doc/` and undo / redo are **derived** from [Wordgard](https://wordgard.net/) (MIT), whose design in turn comes from [CodeMirror 6](https://codemirror.net/).  
The files are listed under "Third-party code" in [packages/core/LICENSE](packages/core/LICENSE).

The input and view layers (`ime/` `input/` `view/`) are our own.  
This project is unaffiliated with the Wordgard project and is not endorsed by it.
