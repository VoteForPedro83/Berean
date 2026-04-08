/* ============================================================
   CitationNote — Inline footnote / citation superscript
   Links to CitationRegistry IDB entry.
   ============================================================ */
import { Node, mergeAttributes } from '@tiptap/core';

export const CitationNote = Node.create({
  name: 'citationNote',
  group: 'inline',
  inline: true,
  atom: true,    // not editable inline — click to edit

  addAttributes() {
    return {
      citationId: { default: '' },
      label:      { default: '?' },
    };
  },

  parseHTML() {
    return [{ tag: 'sup[data-type="citation"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['sup', mergeAttributes({
      'data-type': 'citation',
      'data-citation-id': HTMLAttributes.citationId,
      class: 'citation-note',
    }), node.attrs.label || '?'];
  },
});
