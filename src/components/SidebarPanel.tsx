import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type ReactNode } from "react";

export function SidebarPanel({
  collapsed,
  onChange,
  children,
}: {
  collapsed: boolean;
  onChange: (collapsed: boolean) => void;
  children: ReactNode;
}) {
  const gesture = useRef<{ x: number; y: number; dragged: boolean }>({
    x: 0,
    y: 0,
    dragged: false,
  });
  return (
    <div className="sidebar-panel" data-collapsed={collapsed}>
      <div
        id="sidebar-content"
        className="sidebar-content"
        inert={collapsed}
        aria-hidden={collapsed}
      >
        {children}
      </div>
      <button
        className="sidebar-toggle"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        aria-controls="sidebar-content"
        title={
          collapsed
            ? "Expand sidebar — click or drag"
            : "Collapse sidebar — click or drag"
        }
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          gesture.current = { x: e.clientX, y: e.clientY, dragged: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const narrow = window.matchMedia("(max-width: 760px)").matches;
          const delta = narrow
            ? e.clientY - gesture.current.y
            : e.clientX - gesture.current.x;
          if (Math.abs(delta) >= 30) {
            gesture.current.dragged = true;
            onChange(delta < 0);
          }
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          gesture.current.dragged = true;
        }}
        onClick={(e) => {
          if (e.detail === 0 || !gesture.current.dragged) onChange(!collapsed);
        }}
      >
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>
    </div>
  );
}
