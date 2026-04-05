import {
  memo,
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

export function VirtualMessageList<T>({
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
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});

  useEffect(() => {
    const scrollParent = scrollParentRef.current;
    if (!scrollParent) return;

    const updateViewport = () => {
      setViewportHeight(scrollParent.clientHeight);
      setScrollTop(scrollParent.scrollTop);
    };

    updateViewport();

    const handleScroll = () => {
      setScrollTop(scrollParent.scrollTop);
    };

    const resizeObserver = new ResizeObserver(() => {
      updateViewport();
    });
    resizeObserver.observe(scrollParent);
    scrollParent.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
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
      const next: Record<string, number> = {};
      let changed = false;

      for (const key of itemKeys) {
        if (previous[key] !== undefined) {
          next[key] = previous[key];
        }
      }

      if (Object.keys(previous).length !== Object.keys(next).length) {
        changed = true;
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
      totalHeight += (key ? measuredHeights[key] : undefined) ?? estimateHeight;
    }

    return { offsets, totalHeight };
  }, [estimateHeight, itemKeys, items.length, measuredHeights]);

  const visibleRange = useMemo(() => {
    if (!enabled || items.length === 0) {
      return { start: 0, end: items.length };
    }

    const viewportBottom = scrollTop + viewportHeight;
    let start = 0;
    let end = items.length;

    while (
      start < items.length &&
      layout.offsets[start] + (((measuredHeights[itemKeys[start]] ?? estimateHeight))) < scrollTop
    ) {
      start += 1;
    }

    end = start;
    while (end < items.length && layout.offsets[end] < viewportBottom) {
      end += 1;
    }

    return {
      start: Math.max(0, start - overscan),
      end: Math.min(items.length, end + overscan),
    };
  }, [
    enabled,
    estimateHeight,
    itemKeys,
    items.length,
    layout.offsets,
    measuredHeights,
    overscan,
    scrollTop,
    viewportHeight,
  ]);

  const topSpacer = enabled ? layout.offsets[visibleRange.start] ?? 0 : 0;
  const renderedHeight = enabled
    ? (() => {
        let total = 0;
        for (let index = visibleRange.start; index < visibleRange.end; index += 1) {
          total += measuredHeights[itemKeys[index]] ?? estimateHeight;
        }
        return total;
      })()
    : layout.totalHeight;
  const bottomSpacer = enabled
    ? Math.max(0, layout.totalHeight - topSpacer - renderedHeight)
    : 0;

  const handleHeightChange = (key: string, height: number) => {
    setMeasuredHeights((previous) => {
      const roundedHeight = Math.ceil(height);
      if (previous[key] === roundedHeight) {
        return previous;
      }
      return {
        ...previous,
        [key]: roundedHeight,
      };
    });
  };

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
