/* ============================================================
   ApplicationBlock — Congregational takeaway / action step
   Renders with sage left border and ::before arrow icon.
   ============================================================ */
import { Node, mergeAttributes } from '@tiptap/core';

export const ApplicationBlock = Node.create({
  name: 'applicationBlock',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="application"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({
      'data-type': 'application',
      class: 'application-block',
    }), 0];
  },
});
