/* ============================================================
   ClippingBlock — Pasted quotation with locked attribution
   AI clippings append "(Verify independently)".
   ============================================================ */
import { Node, mergeAttributes } from '@tiptap/core';

export const ClippingBlock = Node.create({
  name: 'clippingBlock',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      source:      { default: '' },
      attribution: { default: '' },
      osisId:      { default: '' },
      isAI:        { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'blockquote[data-type="clipping"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes({
      'data-type': 'clipping',
      class: 'clipping-block',
    }), 0];
  },
});
