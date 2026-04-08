/* ============================================================
   PointHeading — Homiletical heading (MainPoint / SubPoint)
   Used by presentation-mode filter.
   ============================================================ */
import { Node, mergeAttributes } from '@tiptap/core';

export const PointHeading = Node.create({
  name: 'pointHeading',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      level: { default: 'main' },   // 'main' | 'sub'
    };
  },

  parseHTML() {
    return [
      { tag: 'h3[data-type="point"]', attrs: { level: 'main' } },
      { tag: 'h4[data-type="point"]', attrs: { level: 'sub' } },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const tag = HTMLAttributes.level === 'sub' ? 'h4' : 'h3';
    return [tag, mergeAttributes({
      'data-type': 'point',
      class: `point-heading point-heading--${HTMLAttributes.level}`,
    }), 0];
  },
});
