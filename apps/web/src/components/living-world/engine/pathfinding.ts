/**
 * A* em grade 4-direções (movimento "de pixel art", sem cortar quinas).
 * Se o destino estiver bloqueado, procura o vizinho livre mais próximo dele.
 */
export type Point = { x: number; y: number };

const DIRS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const key = (p: Point) => p.x * 1000 + p.y;

export function nearestFree(blocked: boolean[][], target: Point): Point | null {
  const W = blocked.length;
  const H = blocked[0]?.length ?? 0;
  const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < W && p.y < H;
  if (inside(target) && !blocked[target.x]![target.y]) return target;
  const seen = new Set<number>([key(target)]);
  const queue: Point[] = [target];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const d of DIRS) {
      const n = { x: cur.x + d.x, y: cur.y + d.y };
      if (!inside(n) || seen.has(key(n))) continue;
      if (!blocked[n.x]![n.y]) return n;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return null;
}

/** Caminho do início (exclusivo) ao destino (inclusivo); [] se já está lá; null se não há caminho. */
export function findPath(blocked: boolean[][], start: Point, goal: Point): Point[] | null {
  const W = blocked.length;
  const H = blocked[0]?.length ?? 0;
  const target = nearestFree(blocked, goal);
  if (!target) return null;
  if (start.x === target.x && start.y === target.y) return [];
  const open: Array<{ p: Point; f: number }> = [{ p: start, f: 0 }];
  const came = new Map<number, Point>();
  const g = new Map<number, number>([[key(start), 0]]);
  const h = (p: Point) => Math.abs(p.x - target.x) + Math.abs(p.y - target.y);
  const closed = new Set<number>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]!.f < open[bi]!.f) bi = i;
    const { p: cur } = open.splice(bi, 1)[0]!;
    const ck = key(cur);
    if (cur.x === target.x && cur.y === target.y) {
      const path: Point[] = [cur];
      let k = ck;
      while (came.has(k)) {
        const prev = came.get(k)!;
        if (prev.x === start.x && prev.y === start.y) break;
        path.unshift(prev);
        k = key(prev);
      }
      return path;
    }
    if (closed.has(ck)) continue;
    closed.add(ck);
    for (const d of DIRS) {
      const n = { x: cur.x + d.x, y: cur.y + d.y };
      if (n.x < 0 || n.y < 0 || n.x >= W || n.y >= H || blocked[n.x]![n.y]) continue;
      const nk = key(n);
      const tentative = (g.get(ck) ?? Infinity) + 1;
      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, cur);
        g.set(nk, tentative);
        open.push({ p: n, f: tentative + h(n) });
      }
    }
  }
  return null;
}
