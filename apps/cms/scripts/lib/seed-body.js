// Turns a seed body from Markdown into a list of Blocks. Only what the web app's rich text schema accepts can come
// out of it: paragraphs, headings, lists, quotes, links, bold and italic. Lines of a paragraph are joined with a
// space, so each sentence can sit on its own line. A line starting with @ is a Block that is not text:
//   @image file.jpg | Optional caption
//   @pair left.jpg | right.jpg
//   @gallery first.jpg | second.jpg | third.jpg
//   @quote team-member-key | The words they said.
//   @drawing plan | file.jpg | Required caption
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

const inline = (text) => {
  const nodes = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) nodes.push({ type: 'text', text: text.slice(at, match.index) });
    const [whole, label, url, bold, italic] = match;
    if (label) nodes.push({ type: 'link', url, children: [{ type: 'text', text: label }] });
    else if (bold) nodes.push({ type: 'text', text: bold, bold: true });
    else nodes.push({ type: 'text', text: italic, italic: true });
    at = match.index + whole.length;
  }
  if (at < text.length) nodes.push({ type: 'text', text: text.slice(at) });
  return nodes;
};

const listOf = (format, lines, marker) => ({
  type: 'list',
  format,
  children: lines.map((line) => ({ type: 'list-item', children: inline(line.replace(marker, '')) })),
});

const textNode = (lines) => {
  const heading = lines[0].match(/^(#{2,4}) (.+)$/);
  if (heading) return { type: 'heading', level: heading[1].length, children: inline(heading[2]) };
  if (lines.every((line) => line.startsWith('- '))) return listOf('unordered', lines, /^- /);
  if (lines.every((line) => /^\d+\. /.test(line))) return listOf('ordered', lines, /^\d+\. /);
  if (lines.every((line) => line.startsWith('> '))) return { type: 'quote', children: inline(lines.map((line) => line.slice(2)).join(' ')) };
  return { type: 'paragraph', children: inline(lines.join(' ')) };
};

const directive = (line) => {
  const [head, ...rest] = line.slice(1).split('|').map((part) => part.trim());
  const [name, first] = head.split(/\s+/);
  const args = [first, ...rest];
  switch (name) {
    case 'image':
      return { kind: 'image', file: args[0], caption: args[1] };
    case 'pair':
      return { kind: 'pair', files: args };
    case 'gallery':
      return { kind: 'gallery', files: args };
    case 'quote':
      return { kind: 'quote', speaker: args[0], text: args[1] };
    case 'drawing':
      return { kind: 'drawing', drawing: args[0], file: args[1], caption: args[2] };
    default:
      throw new Error(`unknown directive @${name}`);
  }
};

const parseBody = (markdown) => {
  const blocks = [];
  let text = null;
  for (const chunk of markdown.split(/\r?\n\s*\r?\n/)) {
    const lines = chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines[0].startsWith('@')) {
      text = null;
      blocks.push(directive(lines[0]));
      continue;
    }
    if (!text) {
      text = { kind: 'text', nodes: [] };
      blocks.push(text);
    }
    text.nodes.push(textNode(lines));
  }
  return blocks;
};

module.exports = { parseBody };
