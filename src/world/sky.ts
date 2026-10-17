/** Sky colours, shared by the page background (App) and the walk-mode fog so they always match. */
export const SKY_LOW = { top: [185, 222, 240], mid: [220, 239, 244], bottom: [246, 238, 221] }
export const SKY_HIGH = { top: [150, 212, 246], mid: [214, 240, 236], bottom: [255, 232, 196] }

export function mixRgb(a: number[], b: number[], t: number): [number, number, number] {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t)) as [number, number, number]
}

export const rgb = (c: number[]) => `rgb(${c.join(',')})`
