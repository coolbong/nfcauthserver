const NS = 'http://www.w3.org/2000/svg';

export function rosette(svg, color, { size = 400, petals = 7, loops = 24 } = {}) {
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const c = size / 2;
  for (let k = 0; k < loops; k += 1) {
    const rot = (k / loops) * Math.PI * 2;
    let d = '';
    for (let i = 0; i <= 360; i += 1) {
      const t = (i / 360) * Math.PI * 2;
      const r = size * 0.48 * (0.5 + 0.5 * Math.cos(petals * t));
      d += `${i ? 'L' : 'M'}${(c + r * Math.cos(t + rot)).toFixed(1)} ${(c + r * Math.sin(t + rot)).toFixed(1)}`;
    }
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', `${d}Z`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '0.7');
    svg.append(path);
  }
}

export function barcode(svg, value) {
  JsBarcode(svg, value, { format: 'CODE128', displayValue: false, height: 40, margin: 0, width: 1, background: 'transparent', lineColor: 'currentColor' });
  svg.removeAttribute('style');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.removeAttribute('hidden');
}

export const MARKS = {
  genuine: '<path d="M12 29l11 11 21-23"/>',
  recheck: '<path d="M28 12v20M28 44v.5"/>',
  rejected: '<path d="M14 14l28 28M42 14L14 42"/>',
  unavailable: '<path d="M28 12v20M28 44v.5"/>',
};
export const ENG = { genuine: 'AUTHENTIC', recheck: 'RECHECK', rejected: 'NOT VERIFIED', unavailable: 'NO RESULT' };
export const COLOR = { genuine: '#B3131B', recheck: '#B45309', rejected: '#F4686E', unavailable: '#5C5B55' };
