import {
  Component,
  Suspense,
  createRef,
  forwardRef,
  lazy,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type LazyExoticComponent,
  type ReactNode,
  type RefObject,
} from "react";
import { getTool } from "../registry/tools";
import type { ToolComponent } from "../registry/types";
import type { ToolHandle } from "../lib/toolHandle";

// Keep-alive: a tool stays mounted after its first visit, so switching tools
// never discards a half-pasted input. The cap bounds memory if the registry
// grows to dozens of tools; 8 is above the current count.
const MAX_MOUNTED = 8;

// One lazy wrapper per tool id, created once. Creating a new lazy() on every
// render would remount the tool and destroy exactly the state this file exists
// to preserve.
const lazyCache = new Map<string, LazyExoticComponent<ToolComponent>>();

function lazyTool(id: string, load: () => Promise<{ default: ToolComponent }>): LazyExoticComponent<ToolComponent> {
  const cached = lazyCache.get(id);
  if (cached) return cached;
  const made = lazy(load);
  lazyCache.set(id, made);
  return made;
}

function ToolSkeleton() {
  return (
    <div className="grid h-full gap-3 p-3 md:grid-cols-2" aria-hidden="true">
      <div className="animate-pulse rounded-[10px] border border-border-subtle bg-surface" />
      <div className="animate-pulse rounded-[10px] border border-border-subtle bg-surface" />
    </div>
  );
}

// Minimal local boundary. T-108 replaces this with the shared ErrorBoundary
// that offers a "Reset tool" action.
class ToolErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="flex h-full items-center justify-center p-6 text-center text-sm text-err">
          This tool hit an error. Your input is still here.
        </div>
      );
    }
    return this.props.children;
  }
}

export interface ToolHostHandle {
  getActiveHandle: () => ToolHandle | null;
}

const ToolHost = forwardRef<ToolHostHandle, { activeId: string }>(function ToolHost({ activeId }, ref) {
  const [mounted, setMounted] = useState<string[]>([activeId]);
  const handles = useRef(new Map<string, RefObject<ToolHandle>>());

  useEffect(() => {
    setMounted((prev) => {
      if (prev[prev.length - 1] === activeId) return prev;
      return [...prev.filter((id) => id !== activeId), activeId].slice(-MAX_MOUNTED);
    });
  }, [activeId]);

  useImperativeHandle(
    ref,
    () => ({ getActiveHandle: () => handles.current.get(activeId)?.current ?? null }),
    [activeId]
  );

  // The union keeps the very first paint correct when activeId is not in
  // `mounted` yet: the effect above runs after paint, so waiting for it would
  // show an empty workspace for one frame. It must de-duplicate exactly like the
  // effect does — appending a tool that is already mounted renders it twice,
  // which duplicates its test ids and its live editors.
  const ids =
    mounted[mounted.length - 1] === activeId
      ? mounted
      : [...mounted.filter((id) => id !== activeId), activeId].slice(-MAX_MOUNTED);

  return (
    <>
      {ids.map((id) => {
        const tool = getTool(id);
        if (!tool) return null;

        let handle = handles.current.get(id);
        if (!handle) {
          handle = createRef<ToolHandle>();
          handles.current.set(id, handle);
        }
        const Lazy = lazyTool(id, tool.load);

        return (
          <div key={id} className={id === activeId ? "h-full" : "hidden"}>
            <ToolErrorBoundary key={id}>
              <Suspense fallback={<ToolSkeleton />}>
                <Lazy ref={handle} isActive={id === activeId} />
              </Suspense>
            </ToolErrorBoundary>
          </div>
        );
      })}
    </>
  );
});

export default ToolHost;
