import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

interface VirtualMessageListProps<T> {
  items: T[];
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  scrollParentRef: RefObject<HTMLDivElement | null>;
  estimateHeight?: number;
  overscan?: number;
  enabled?: boolean;
  className?: string;
}

interface MeasuredItemProps {
  itemKey: string;
  onHeightChange: (itemKey: string, height: number) => void;
  children: ReactNode;
}

const MeasuredItem = memo(function MeasuredItem({
  itemKey,
  onHeightChange,
  children,
}: MeasuredItemProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const reportHeight = () => {
      onHeightChange(itemKey, element.getBoundingClientRect().height);
    };

    reportHeight();

    const observer = new ResizeObserver(() => {
      reportHeight();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [itemKey, onHeightChange]);

  return <div ref={elementRef}>{children}</div>;
});

function VirtualMessageListInner<T>({
  items,
  itemKey,
  renderItem,
  scrollParentRef,
  estimateHeight = 220,
  overscan = 4,
  enabled = true,
  className,
}: VirtualMessageListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState<Map<string, number>>(() => new Map());
  const scrollRafRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef<number>(0);

  useEffect(() => {
    const scrollParent = scrollParentRef.current;
    if (!scrollParent) return;

    const updateViewport = () => {
      const nextViewportHeight = scrollParent.clientHeight;
      const nextScrollTop = scrollParent.scrollTop;
      setViewportHeight((previous) =>
        previous === nextViewportHeight ? previous : nextViewportHeight,
      );
      setScrollTop((previous) => (previous === nextScrollTop ? previous : nextScrollTop));
    };

    updateViewport();

    const handleScroll = () => {
      pendingScrollTopRef.current = scrollParent.scrollTop;
      if (scrollRafRef.current !== null) {
        return;
      }
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const nextTop = pendingScrollTopRef.current;
        setScrollTop((previous) => (previous === nextTop ? previous : nextTop));
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      updateViewport();
    });
    resizeObserver.observe(scrollParent);
    scrollParent.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      resizeObserver.disconnect();
      scrollParent.removeEventListener("scroll", handleScroll);
    };
  }, [scrollParentRef]);

  const itemKeys = useMemo(
    () => items.map((item, index) => itemKey(item, index)),
    [items, itemKey],
  );

  useEffect(() => {
    setMeasuredHeights((previous) => {
      const keySet = new Set(itemKeys);
      const next = new Map(previous);
      let changed = false;
      for (const key of next.keys()) {
        if (!keySet.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [itemKeys]);

  const layout = useMemo(() => {
    const offsets: number[] = [];
    let totalHeight = 0;

    for (let index = 0; index < items.length; index += 1) {
      offsets[index] = totalHeight;
      const key = itemKeys[index];
      totalHeight += (key ? measuredHeights.get(key) : undefined) ?? estimateHeight;
    }

    return { offsets, totalHeight };
  }, [estimateHeight, itemKeys, items.length, measuredHeights]);

  const findStartIndex = useCallback(
    (targetScrollTop: number) => {
      if (items.length === 0) return 0;
      let low = 0;
      let high = items.length - 1;
      let candidate = items.length;

      while (low <= high) {
        const mid = (low + high) >> 1;
        const key = itemKeys[mid];
        const height = (key ? measuredHeights.get(key) : undefined) ?? estimateHeight;
        const bottom = layout.offsets[mid] + height;
        if (bottom >= targetScrollTop) {
          candidate = mid;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }

      if (candidate === items.length) {
        return items.length - 1;
      }
      return candidate;
    },
    [estimateHeight, itemKeys, items.length, layout.offsets, measuredHeights],
  );

  const findEndIndex = useCallback(
    (viewportBottom: number) => {
      if (items.length === 0) return 0;
      let low = 0;
      let high = items.length - 1;
      let candidate = items.length;

      while (low <= high) {
        const mid = (low + high) >> 1;
        if (layout.offsets[mid] >= viewportBottom) {
          candidate = mid;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }

      return candidate === items.length ? items.length : candidate;
    },
    [items.length, layout.offsets],
  );

  const visibleRange = useMemo(() => {
    if (!enabled || items.length === 0) {
      return { start: 0, end: items.length };
    }

    const viewportBottom = scrollTop + viewportHeight;
    const start = findStartIndex(scrollTop);
    const end = Math.max(start, findEndIndex(viewportBottom));

    return {
      start: Math.max(0, start - overscan),
      end: Math.min(items.length, end + overscan),
    };
  }, [
    enabled,
    findEndIndex,
    findStartIndex,
    items.length,
    overscan,
    scrollTop,
    viewportHeight,
  ]);

  const topSpacer = enabled ? layout.offsets[visibleRange.start] ?? 0 : 0;
  const renderedHeight = enabled
    ? (() => {
        let total = 0;
        for (let index = visibleRange.start; index < visibleRange.end; index += 1) {
          total += measuredHeights.get(itemKeys[index] ?? "") ?? estimateHeight;
        }
        return total;
      })()
    : layout.totalHeight;
  const bottomSpacer = enabled
    ? Math.max(0, layout.totalHeight - topSpacer - renderedHeight)
    : 0;

  const handleHeightChange = useCallback((key: string, height: number) => {
    setMeasuredHeights((previous) => {
      const roundedHeight = Math.ceil(height);
      if (previous.get(key) === roundedHeight) {
        return previous;
      }
      const next = new Map(previous);
      next.set(key, roundedHeight);
      return next;
    });
  }, []);

  const visibleItems = enabled ? items.slice(visibleRange.start, visibleRange.end) : items;
  const startIndex = enabled ? visibleRange.start : 0;

  return (
    <div className={className}>
      {topSpacer > 0 && <div style={{ height: topSpacer }} />}
      {visibleItems.map((item, offsetIndex) => {
        const actualIndex = startIndex + offsetIndex;
        const key = itemKeys[actualIndex] ?? `${actualIndex}`;
        return (
          <MeasuredItem key={key} itemKey={key} onHeightChange={handleHeightChange}>
            {renderItem(item, actualIndex)}
          </MeasuredItem>
        );
      })}
      {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} />}
    </div>
  );
}

export const VirtualMessageList = memo(VirtualMessageListInner) as typeof VirtualMessageListInner;
