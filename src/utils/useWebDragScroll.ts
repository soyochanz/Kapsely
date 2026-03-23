import { useEffect, RefObject } from 'react';
import { Platform } from 'react-native';

export const useWebDragScroll = (ref: RefObject<any>) => {
  useEffect(() => {
    if (Platform.OS !== 'web' || !ref.current) return;

    // For ScrollView, FlatList, SectionList in RN Web
    const el = ref.current.getScrollableNode 
      ? ref.current.getScrollableNode() 
      : ref.current;

    if (!el) return;

    let isDown = false;
    let startX: number;
    let startY: number;
    let scrollLeft: number;
    let scrollTop: number;
    let moved = false;

    const onMouseDown = (e: MouseEvent) => {
      isDown = true;
      moved = false;
      const rect = el.getBoundingClientRect();
      startX = e.pageX - rect.left - window.scrollX;
      startY = e.pageY - rect.top - window.scrollY;
      scrollLeft = el.scrollLeft;
      scrollTop = el.scrollTop;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    };

    const onMouseLeave = () => {
      isDown = false;
      el.style.cursor = 'default';
      el.style.userSelect = 'auto';
    };

    const onMouseUp = () => {
      isDown = false;
      el.style.cursor = 'default';
      el.style.userSelect = 'auto';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      el.style.cursor = 'grabbing';

      const rect = el.getBoundingClientRect();
      const x = e.pageX - rect.left - window.scrollX;
      const y = e.pageY - rect.top - window.scrollY;
      const walkX = (x - startX) * 1.5; // Drag speed
      const walkY = (y - startY) * 1.5;

      if (Math.abs(walkX) > 3 || Math.abs(walkY) > 3) {
        moved = true;
      }

      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        if (el.scrollLeft !== undefined) el.scrollLeft = scrollLeft - walkX;
        if (el.scrollTop !== undefined) el.scrollTop = scrollTop - walkY;
      }
    };

    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mouseleave', onMouseLeave);
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('click', onClick, { capture: true });

    return () => {
      if (!el) return;
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mouseleave', onMouseLeave);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('click', onClick, { capture: true });
    };
  }, [ref]);
};
