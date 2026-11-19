import { PointerEvent as RPointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Leg, PendingInvite, Settings, TeamRow } from '../lib/types';
import { fmt0, initials, isActive } from '../lib/types';
import { Badge, Icon } from '../ui/kit';

const UNIT = 156;     // horizontal space per leaf
const LEVEL = 158;    // vertical distance between generations
const NODE_W = 138, NODE_H = 108, SLOT_W = 112, SLOT_H = 76;
const MAX_DEPTH = 8;

type LayoutNode =
  | { kind: 'member'; m: TeamRow; x: number; y: number; depth: number; more: boolean }
  | { kind: 'slot'; parent: TeamRow; leg: Leg; x: number; y: number; depth: number; pending?: PendingInvite };
interface Link { x1: number; y1: number; x2: number; y2: number; filled: boolean }

function layout(rootId: string, byId: Map<string, TeamRow>, invites: PendingInvite[]) {
  const nodes: LayoutNode[] = [];
  const links: Link[] = [];
  let cursor = 0;
  const place = (m: TeamRow, depth: number): number => {
    const y = depth * LEVEL;
    if (depth >= MAX_DEPTH) {
      const x = cursor * UNIT + UNIT / 2; cursor++;
      nodes.push({ kind: 'member', m, x, y, depth, more: !!(m.left_id || m.right_id) });
      return x;
    }
    const xs: number[] = [];
    (['L', 'R'] as Leg[]).forEach((leg) => {
      const childId = leg === 'L' ? m.left_id : m.right_id;
      const child = childId ? byId.get(childId) : undefined;
      if (child) xs.push(place(child, depth + 1));
      else {
        const x = cursor * UNIT + UNIT / 2; cursor++;
        const pending = invites.find((iv) => iv.parent_code === m.code && iv.leg === leg);
        nodes.push({ kind: 'slot', parent: m, leg, x, y: (depth + 1) * LEVEL, depth: depth + 1, pending });
        xs.push(x);
      }
    });
    const x = (xs[0] + xs[1]) / 2;
    nodes.push({ kind: 'member', m, x, y, depth, more: false });
    xs.forEach((cx, i) => {
      const childId = i === 0 ? m.left_id : m.right_id;
      links.push({ x1: x, y1: y + NODE_H, x2: cx, y2: (depth + 1) * LEVEL, filled: !!(childId && byId.get(childId)) });
    });
    return x;
  };
  const root = byId.get(rootId);
  if (root) place(root, 0);
  const width = Math.max(cursor * UNIT, UNIT);
  const depth = nodes.reduce((a, n) => Math.max(a, n.depth), 0);
  return { nodes, links, width, height: depth * LEVEL + NODE_H + 20 };
}

export default function TreeCanvas({ team, rootId, invites, settings, paidDirectsOf, selectedId, onSelect, onPlace }: {
  team: TeamRow[]; rootId: string; invites: PendingInvite[]; settings: Settings; paidDirectsOf: (id: string) => number;
  selectedId: string | null; onSelect: (m: TeamRow) => void; onPlace: (parent: TeamRow, leg: Leg) => void;
}) {
  const byId = useMemo(() => new Map(team.map((t) => [t.id, t])), [team]);
  const { nodes, links, width, height } = useMemo(() => layout(rootId, byId, invites), [rootId, byId, invites]);
  const wrap = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const [view, setView] = useState({ x: 0, y: 24, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const fit = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const cw = el.clientWidth;
    const k = Math.max(0.55, Math.min(1, (cw - 40) / width));
    const rootX = nodesRef.current.find((n) => n.kind === 'member' && n.depth === 0)?.x ?? width / 2;
    setView({ k, x: width * k <= cw ? (cw - width * k) / 2 : cw / 2 - rootX * k, y: 28 });
  }, [width, height]);

  useLayoutEffect(() => { fit(); }, [fit, rootId]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      setView((v) => {
        const k = Math.max(0.3, Math.min(2.2, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoom = (f: number) => {
    const el = wrap.current!;
    const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
    setView((v) => { const k = Math.max(0.3, Math.min(2.2, v.k * f)); return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k }; });
  };
  const centerOn = (x: number, y: number) => {
    const el = wrap.current!;
    setView((v) => ({ ...v, x: el.clientWidth / 2 - x * v.k, y: el.clientHeight / 3 - y * v.k }));
  };

  const down = (e: RPointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 4) { d.moved = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const up = () => { setTimeout(() => { drag.current = null; }, 0); };
  const clickable = () => !drag.current?.moved;

  const rootNode = nodes.find((n) => n.kind === 'member' && n.m.id === rootId);

  return (
    <div className="tree-canvas" ref={wrap} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
      <div className="tree-stage" style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="tree-links" width={width} height={height}>
          {links.map((l, i) => {
            const ym = (l.y1 + l.y2) / 2;
            return <path key={i} d={`M${l.x1},${l.y1} C${l.x1},${ym} ${l.x2},${ym} ${l.x2},${l.y2}`} className={l.filled ? 'link filled' : 'link'} />;
          })}
        </svg>
        {nodes.map((n) => {
          if (n.kind === 'slot') {
            const style = { left: n.x - SLOT_W / 2, top: n.y, width: SLOT_W, height: SLOT_H };
            if (n.pending) return (
              <div key={`s-${n.parent.id}-${n.leg}`} className="cnode slot pending" style={style} title={`${n.pending.email} · awaiting email confirmation`}>
                <Icon name="clock" size={16} /><b>{n.pending.name || 'Invited'}</b><span>pending</span>
              </div>
            );
            return (
              <button key={`s-${n.parent.id}-${n.leg}`} className="cnode slot" style={style}
                onClick={() => clickable() && onPlace(n.parent, n.leg)} title={`Register someone under ${n.parent.name} (${n.leg === 'L' ? 'left' : 'right'})`}>
                <Icon name="userPlus" size={17} /><b>Place here</b><span>{n.leg === 'L' ? 'Left' : 'Right'} of {n.parent.name.split(' ')[0]}</span>
              </button>
            );
          }
          const m = n.m;
          const active = isActive(m, settings);
          const qualified = active && paidDirectsOf(m.id) >= settings.qualify_directs;
          return (
            <button key={m.id} className={`cnode member ${m.id === rootId ? 'root' : ''} ${active ? '' : 'inactive'} ${selectedId === m.id ? 'selected' : ''}`}
              style={{ left: n.x - NODE_W / 2, top: n.y, width: NODE_W, height: NODE_H }}
              onClick={() => clickable() && onSelect(m)}>
              <span className="row" style={{ gap: 8, width: '100%' }}>
                <span className="avatar sm">{initials(m.name)}</span>
                <span style={{ minWidth: 0, textAlign: 'left', flex: 1 }}>
                  <span className="nm">{m.name}</span>
                  <span className="cd">{m.code}</span>
                </span>
              </span>
              <span className="vol"><span>L {m.lt.toLocaleString()}</span><span>{active ? fmt0(m.pv) : 'unpaid'}</span><span>R {m.rt.toLocaleString()}</span></span>
              <span>{n.more ? <Badge tone="mute">+ more below</Badge> : qualified ? <Badge tone="ok">Qualified</Badge> : active ? <Badge tone="gold">Active</Badge> : <Badge>Registered</Badge>}</span>
            </button>
          );
        })}
      </div>
      <div className="canvas-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn sm icon" onClick={() => zoom(1.2)} aria-label="Zoom in" title="Zoom in"><Icon name="plus" size={15} /></button>
        <button className="btn sm icon" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out" title="Zoom out"><Icon name="minus" size={15} /></button>
        <button className="btn sm icon" onClick={fit} aria-label="Fit tree" title="Fit to view"><Icon name="scan" size={15} /></button>
        {rootNode && <button className="btn sm icon" onClick={() => centerOn(rootNode.x, rootNode.y)} aria-label="Center on top" title="Center on top"><Icon name="target" size={15} /></button>}
        <span className="canvas-zoom mono">{Math.round(view.k * 100)}%</span>
      </div>
      <div className="canvas-hint">Drag to move · scroll to zoom</div>
    </div>
  );
}
