/* ============================================================
   IllustrationBlock — Story / analogy / example
   Renders as <aside> with tinted background and source footer.
   ============================================================ */
import { Node, mergeAttributes } from '@tiptap/core';

export const IllustrationBlock = Node.create({
  name: 'illustrationBlock',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      source:    { default: '' },
      sourceUrl: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-type="illustration"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes({
      'data-type': 'illustration',
      class: 'illustration-block',
    }), 0];
  },
});
