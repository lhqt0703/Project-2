export type SlotPx = { xPx: number; yPx: number };

export function getDeterministicSlots1to18(
  n: number,
  rect: DOMRect,
  yNormToPx: (y: number) => number
): SlotPx[] | null {
  const slots: SlotPx[] = [];

  if (n === 1) {
    slots.push({ xPx: rect.width / 2, yPx: rect.height / 2 });
    return slots;
  }

  if (n === 2) {
    slots.push({ xPx: rect.width * 0.35, yPx: yNormToPx(0.5) });
    slots.push({ xPx: rect.width * 0.65, yPx: yNormToPx(0.5) });
    return slots;
  }

  if (n === 3) {
    slots.push({ xPx: rect.width * 0.5, yPx: yNormToPx(0.2) });
    slots.push({ xPx: rect.width * 0.35, yPx: yNormToPx(0.5) });
    slots.push({ xPx: rect.width * 0.65, yPx: yNormToPx(0.5) });
    return slots;
  }

  if (n === 4) {
    slots.push({ xPx: rect.width * 0.35, yPx: yNormToPx(0.2) });
    slots.push({ xPx: rect.width * 0.65, yPx: yNormToPx(0.2) });
    slots.push({ xPx: rect.width * 0.35, yPx: yNormToPx(0.5) });
    slots.push({ xPx: rect.width * 0.65, yPx: yNormToPx(0.5) });
    return slots;
  }

  if (n === 5) {
    slots.push({ xPx: rect.width * 0.5, yPx: yNormToPx(0.16) });
    slots.push({ xPx: rect.width * 0.28, yPx: yNormToPx(0.42) });
    slots.push({ xPx: rect.width * 0.72, yPx: yNormToPx(0.42) });
    slots.push({ xPx: rect.width * 0.35, yPx: yNormToPx(0.68) });
    slots.push({ xPx: rect.width * 0.65, yPx: yNormToPx(0.68) });
    return slots;
  }

  if (n === 6) {
    slots.push({ xPx: rect.width * 0.38, yPx: yNormToPx(0.16) });
    slots.push({ xPx: rect.width * 0.62, yPx: yNormToPx(0.16) });
    slots.push({ xPx: rect.width * 0.25, yPx: yNormToPx(0.39) });
    slots.push({ xPx: rect.width * 0.75, yPx: yNormToPx(0.39) });
    slots.push({ xPx: rect.width * 0.38, yPx: yNormToPx(0.67) });
    slots.push({ xPx: rect.width * 0.62, yPx: yNormToPx(0.67) });
    return slots;
  }

  if (n === 7) {
    slots.push({ xPx: rect.width * 0.26, yPx: yNormToPx(0.16) });
    slots.push({ xPx: rect.width * 0.42, yPx: yNormToPx(0.16) });
    slots.push({ xPx: rect.width * 0.58, yPx: yNormToPx(0.16) });
    slots.push({ xPx: rect.width * 0.74, yPx: yNormToPx(0.16) });
    slots.push({ xPx: rect.width * 0.33, yPx: yNormToPx(0.5) });
    slots.push({ xPx: rect.width * 0.5, yPx: yNormToPx(0.5) });
    slots.push({ xPx: rect.width * 0.67, yPx: yNormToPx(0.5) });
    return slots;
  }

  if (n === 8) {
    slots.push({ xPx: rect.width * 0.415, yPx: yNormToPx(0.16) });
    slots.push({ xPx: rect.width * 0.585, yPx: yNormToPx(0.16) });
    slots.push({ xPx: rect.width * 0.27, yPx: yNormToPx(0.32) });
    slots.push({ xPx: rect.width * 0.73, yPx: yNormToPx(0.32) });
    slots.push({ xPx: rect.width * 0.27, yPx: yNormToPx(0.54) });
    slots.push({ xPx: rect.width * 0.73, yPx: yNormToPx(0.54) });
    slots.push({ xPx: rect.width * 0.415, yPx: yNormToPx(0.7) });
    slots.push({ xPx: rect.width * 0.585, yPx: yNormToPx(0.7) });
    return slots;
  }

  if (n === 9) {
    const y1 = yNormToPx(0.16);
    const y2 = yNormToPx(0.5);
    const xsTop = [0.18, 0.34, 0.5, 0.66, 0.82].map(x => rect.width * x);
    const xsBot = [0.26, 0.42, 0.58, 0.74].map(x => rect.width * x);
    for (const xPx of xsTop) slots.push({ xPx, yPx: y1 });
    for (const xPx of xsBot) slots.push({ xPx, yPx: y2 });
    return slots;
  }

  if (n === 10) {
    const y1 = yNormToPx(0.16);
    const y2 = yNormToPx(0.3);
    const y3 = yNormToPx(0.53);
    const y4 = yNormToPx(0.66);
    slots.push({ xPx: rect.width * 0.33, yPx: y1 });
    slots.push({ xPx: rect.width * 0.5, yPx: y1 });
    slots.push({ xPx: rect.width * 0.67, yPx: y1 });
    slots.push({ xPx: rect.width * 0.18, yPx: y2 });
    slots.push({ xPx: rect.width * 0.82, yPx: y2 });
    slots.push({ xPx: rect.width * 0.18, yPx: y3 });
    slots.push({ xPx: rect.width * 0.82, yPx: y3 });
    slots.push({ xPx: rect.width * 0.33, yPx: y4 });
    slots.push({ xPx: rect.width * 0.5, yPx: y4 });
    slots.push({ xPx: rect.width * 0.67, yPx: y4 });
    return slots;
  }

  if (n === 11) {
    const yTop = yNormToPx(0.16);
    const yMid = yNormToPx(0.4);
    const yBot = yNormToPx(0.64);
    const top5 = [0.15, 0.326, 0.5, 0.67, 0.85].map(x => rect.width * x);
    const bot4 = [0.15, 0.381, 0.608, 0.85].map(x => rect.width * x);
    for (const xPx of top5) slots.push({ xPx, yPx: yTop });
    slots.push({ xPx: rect.width * 0.15, yPx: yMid });
    slots.push({ xPx: rect.width * 0.85, yPx: yMid });
    for (const xPx of bot4) slots.push({ xPx, yPx: yBot });
    return slots;
  }

  if (n === 12) {
    const yTop = yNormToPx(0.16);
    const yMid = yNormToPx(0.4);
    const yBot = yNormToPx(0.64);
    const xs5 = [0.15, 0.326, 0.5, 0.67, 0.85].map(x => rect.width * x);
    for (const xPx of xs5) slots.push({ xPx, yPx: yTop });
    slots.push({ xPx: rect.width * 0.15, yPx: yMid });
    slots.push({ xPx: rect.width * 0.85, yPx: yMid });
    for (const xPx of xs5) slots.push({ xPx, yPx: yBot });
    return slots;
  }

  if (n === 13) {
    const yTop = yNormToPx(0.16);
    const yMid = yNormToPx(0.38);
    const yBot = yNormToPx(0.6);

    const xsTop = [0.12, 0.31, 0.5, 0.69, 0.88].map(x => rect.width * x);
    const xsBot = [0.12, 0.272, 0.424, 0.576, 0.728, 0.88].map(x => rect.width * x);

    for (const xPx of xsTop) slots.push({ xPx, yPx: yTop });
    slots.push({ xPx: rect.width * 0.12, yPx: yMid });
    slots.push({ xPx: rect.width * 0.88, yPx: yMid });
    for (const xPx of xsBot) slots.push({ xPx, yPx: yBot });
    return slots;
  }

  if (n === 14) {
    const y1 = yNormToPx(0.16);
    const y2 = yNormToPx(0.38);
    const y3 = yNormToPx(0.6);
    const xs6 = [0.12, 0.272, 0.424, 0.576, 0.728, 0.88].map(x => rect.width * x);
    for (const xPx of xs6) slots.push({ xPx, yPx: y1 });
    slots.push({ xPx: rect.width * 0.12, yPx: y2 });
    slots.push({ xPx: rect.width * 0.88, yPx: y2 });
    for (const xPx of xs6) slots.push({ xPx, yPx: y3 });
    return slots;
  }

  if (n === 15) {
    const y1 = yNormToPx(0.16);
    const y2 = yNormToPx(0.38);
    const y3 = yNormToPx(0.6);
    const xs6 = [0.083, 0.2498, 0.4166, 0.5834, 0.7502, 0.917].map(x => rect.width * x);
    const xs7 = [0.083, 0.222, 0.361, 0.5, 0.639, 0.778, 0.917].map(x => rect.width * x);
    for (const xPx of xs6) slots.push({ xPx, yPx: y1 });
    slots.push({ xPx: rect.width * 0.083, yPx: y2 });
    slots.push({ xPx: rect.width * 0.917, yPx: y2 });
    for (const xPx of xs7) slots.push({ xPx, yPx: y3 });
    return slots;
  }

  if (n === 16) {
    const y1 = yNormToPx(0.16);
    const y2 = yNormToPx(0.38);
    const y3 = yNormToPx(0.6);
    const xs7 = [0.083, 0.222, 0.361, 0.5, 0.639, 0.778, 0.917].map(x => rect.width * x);
    for (const xPx of xs7) slots.push({ xPx, yPx: y1 });
    slots.push({ xPx: rect.width * 0.083, yPx: y2 });
    slots.push({ xPx: rect.width * 0.917, yPx: y2 });
    for (const xPx of xs7) slots.push({ xPx, yPx: y3 });
    return slots;
  }

  if (n === 17) {
    const y1 = yNormToPx(0.16);
    const y2 = yNormToPx(0.38);
    const y3 = yNormToPx(0.6);
    const y4 = yNormToPx(0.82);
    const xs6 = [0.083, 0.2498, 0.4166, 0.5834, 0.7502, 0.917].map(x => rect.width * x);
    const xs7 = [0.083, 0.222, 0.361, 0.5, 0.639, 0.778, 0.917].map(x => rect.width * x);
    for (const xPx of xs6) slots.push({ xPx, yPx: y1 });
    slots.push({ xPx: rect.width * 0.083, yPx: y2 });
    slots.push({ xPx: rect.width * 0.917, yPx: y2 });
    slots.push({ xPx: rect.width * 0.083, yPx: y3 });
    slots.push({ xPx: rect.width * 0.917, yPx: y3 });
    for (const xPx of xs7) slots.push({ xPx, yPx: y4 });
    return slots;
  }

  if (n === 18) {
    const y1 = yNormToPx(0.16);
    const y2 = yNormToPx(0.38);
    const y3 = yNormToPx(0.6);
    const y4 = yNormToPx(0.82);
    const xs7 = [0.083, 0.222, 0.361, 0.5, 0.639, 0.778, 0.917].map(x => rect.width * x);
    for (const xPx of xs7) slots.push({ xPx, yPx: y1 });
    slots.push({ xPx: rect.width * 0.083, yPx: y2 });
    slots.push({ xPx: rect.width * 0.917, yPx: y2 });
    slots.push({ xPx: rect.width * 0.083, yPx: y3 });
    slots.push({ xPx: rect.width * 0.917, yPx: y3 });
    for (const xPx of xs7) slots.push({ xPx, yPx: y4 });
    return slots;
  }

  return null;
}
