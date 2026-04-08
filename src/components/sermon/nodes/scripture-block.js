/* ============================================================
   ScriptureBlock — Blockquote with gold left border
   Attributes: ref (OSIS), trans (translation ID)
   ============================================================ */
import { Node, mergeAttributes } from '@tiptap/core';

export const ScriptureBlock = Node.create({
  name: 'scriptureBlock',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      ref:   { default: '' },
      trans: { default: 'BSB' },
    };
  },

  parseHTML() {
    return [{ tag: 'blockquote[data-type="scripture"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes({
      'data-type': 'scripture',
      'data-ref':  HTMLAttributes.ref,
      'data-trans': HTMLAttributes.trans,
      class: 'scripture-block',
    }), 0];
  },
});
