"use client";

import { GripHorizontal, PanelLeft, PanelRight, PictureInPicture2, X } from "lucide-react";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";

export type SidecarPlacement = "left" | "right" | "floating";

type Props = {
  id: string;
  title: string;
  placement: SidecarPlacement;
  floatingIndex?: number;
  dockSlot?: number;
  dockCapacity?: number;
  onPlacement: (placement: SidecarPlacement) => void;
  onClose: () => void;
  children: ReactNode;
};

export function TerminalSidecar({ id, title, placement, floatingIndex = 0, dockSlot, dockCapacity, onPlacement, onClose, children }: Props) {
  const [position, setPosition] = useState(() => ({ x: 110 + floatingIndex * 34, y: 122 + floatingIndex * 30 }));
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (placement !== "floating" || (event.target as HTMLElement).closest("button")) return;
    dragState.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = 390;
    const height = 260;
    const x = Math.min(Math.max(8, drag.originX + event.clientX - drag.startX), Math.max(8, window.innerWidth - width - 8));
    const y = Math.min(Math.max(58, drag.originY + event.clientY - drag.startY), Math.max(58, window.innerHeight - height - 38));
    setPosition({ x, y });
  };

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
  };

  return <aside
    className={`terminal-sidecar ${placement}`}
    data-panel={id}
    style={placement === "floating" ? { transform: `translate3d(${position.x}px, ${position.y}px, 0)`, zIndex: 170 + floatingIndex } : undefined}
  >
    <div className="terminal-sidecar-title" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <span>{placement === "floating" && <GripHorizontal size={14} />}<strong>{title}</strong><small>{placement === "floating" ? "Detached" : placement === "left" && dockSlot && dockCapacity ? `left dock · ${dockSlot}/${dockCapacity}` : `${placement} dock`}</small></span>
      <div>
        <button className={placement === "left" ? "active" : ""} onClick={() => onPlacement("left")} title="Move to left dock" aria-label={`Move ${title} to left`}><PanelLeft size={14} /></button>
        <button className={placement === "right" ? "active" : ""} onClick={() => onPlacement("right")} title="Move to right dock" aria-label={`Move ${title} to right`}><PanelRight size={14} /></button>
        <button className={placement === "floating" ? "active" : ""} onClick={() => onPlacement("floating")} title="Detach panel" aria-label={`Detach ${title}`}><PictureInPicture2 size={14} /></button>
        <button onClick={onClose} title="Close panel" aria-label={`Close ${title}`}><X size={15} /></button>
      </div>
    </div>
    <div className="terminal-sidecar-body">{children}</div>
  </aside>;
}
