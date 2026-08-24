const el = document.getElementById("b");
const ec = new EditContext();
el.editContext = ec;

ec.addEventListener("textupdate", () => {
  el.textContent = ec.text;
  const range = charRange(ec.selectionStart, ec.selectionEnd);
  if (!range) return;
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});

// EditContext never reads the DOM selection, so push it back in
document.addEventListener("selectionchange", () => {
  const sel = getSelection();
  if (!sel.rangeCount || !el.contains(sel.anchorNode)) return;
  const range = sel.getRangeAt(0);
  ec.updateSelection(range.startOffset, range.endOffset);
});

ec.addEventListener("characterboundsupdate", (e) => {
  const rects = [];
  for (let i = e.rangeStart; i < e.rangeEnd; i++) {
    const range = charRange(i, i + 1);
    if (range) rects.push(range.getBoundingClientRect());
  }
  ec.updateCharacterBounds(e.rangeStart, rects);
});

function charRange(start, end) {
  const node = el.firstChild;
  if (!node) return null;
  const range = document.createRange();
  range.setStart(node, Math.min(start, node.length));
  range.setEnd(node, Math.min(end, node.length));
  return range;
}
